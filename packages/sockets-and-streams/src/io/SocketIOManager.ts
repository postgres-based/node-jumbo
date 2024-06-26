// typesResidency
import type { TcpSocketConnectOpts, IpcSocketConnectOpts, ConnectOpts } from 'net';
import type {
    SocketAttributes,
    PoolFirstResidence,
    PoolWaitTimes,
    ActivityWaitTimes,
    PoolTimeBins,
    ActivityTimeBins,
    ActivityWait,
    SendingStatus,
    Residency,
    ResidencyCount,
    Pool,
    ActivityCountBins
} from './types';

// for injection
import { InitializerFactory } from '../initializer/Initializer';
import type { Jitter } from './Jitter';
import Initializer from '../initializer/Initializer';
import { createResolvePromiseExtended, isAggregateError, validatePGSSLConfig } from './helpers';
import delayMillis from '../../src2/utils/delay';
import { insertBefore, removeSelf, count } from '../../src2/utils/list';
import type { List } from '../../src2/utils/list';

import {
    SEND_STATUS_BACKPRESSURE,
    SEND_STATUS_CLOSED,
    SEND_STATUS_OK,
    SEND_STATUS_OK_WITH_BACKPRESSURE,
    SEND_STATUS_ONLY_READ,
    NOTIFY
} from './constants';
import { JournalFactory, Journal } from '../journal';
import {
    CreateSLLConnection,
    CreateSocketConnection,
    PGSSLConfig,
    SocketConnectOpts,
    SocketOtherOptions
} from '../initializer/types';

export default class SocketIOManager {
    private readonly residencies: Residency; // pools

    // the "resident time" histogram of all the pools above
    private readonly poolWaits: PoolWaitTimes;

    // time waits during task "network", "iom_code", "connect"
    private readonly activityWaits: ActivityWaitTimes;

    // aggregate counters of activities , error, end, count
    private readonly activityEvents: ActivityCountBins;
    private readonly initializer: Initializer;
    private readonly journal: Journal<SocketIOManager>;

    // sequence used socket_id's
    private socketId: number;

    constructor(
        private readonly now: () => number,
        private readonly reduceTimeToPoolBins: PoolTimeBins,
        private readonly reduceTimeToActivityBins: ActivityTimeBins, // how are we going to do this?
        private readonly initializerFactory: ReturnType<typeof InitializerFactory>,
        private readonly journalFactory: ReturnType<typeof JournalFactory>,
        private readonly jitter: Jitter
    ) {
        this.initializer = initializerFactory(journalFactory);
        this.socketId = 1;
        this.residencies = {
            active: null,
            vis: null,
            reservedPermanent: null,
            reservedEmpherical: null,
            idle: null,
            created: null,
            terminal: null
        };
        // wait times
        this.poolWaits = {
            active: {},
            vis: {},
            reservedPermanent: {},
            reservedEmpherical: {},
            idle: {},
            created: {},
            terminal: {}
        };
        this.activityWaits = {
            network: {},
            iom_code: {},
            connect: {},
            sslConnect: {},
            finish: {},
            end: {},
            close: {},
            drained: {}
        };
        this.activityEvents = {
            error: 0,
            idle: 0,
            end: 0,
            close: 0
        };
        this.journal = journalFactory(this);
    }

    private markTime(attr: SocketAttributes) {
        return (attr.ioMeta.time.lastReadTS = this.now());
    }

    private removeFromPool(item: List<SocketAttributes>) {
        const currentPool = item!.value.ioMeta.pool.current;
        const next = item!.next ?? null;
        removeSelf(item);
        // if i was the first item in the list then the list is also empty
        if (this.residencies[currentPool] === item) {
            this.residencies[currentPool] = next;
        }
    }

    private migrateToPool(item: Exclude<List<SocketAttributes>, null>, dst: Pool) {
        const ioMeta = item.value.ioMeta;
        const current = ioMeta.pool.current;
        if (current === dst) {
            return;
        }
        const stop = this.now();
        const start = ioMeta.pool.placementTime;
        //
        this.updatePoolWaits(item, start, stop, current);
        this.removeFromPool(item);
        this.residencies[dst] = insertBefore(this.residencies[dst], item);
        //
        ioMeta.pool.lastChecked = stop;
        ioMeta.pool.placementTime = stop;
        ioMeta.pool.current = dst;
    }

    private updateActivityWaitTimes(activity: ActivityWait, start: number, stop: number) {
        const delay = stop - start;
        const bin = this.reduceTimeToActivityBins[activity](delay);
        this.activityWaits[activity][bin] = (this.activityWaits[activity][bin] ?? 0) + 1;
        return delay;
    }

    private updateNetworkStats(item: List<SocketAttributes>, activity: ActivityWait = 'network'): number {
        const now = this.now();
        const {
            socket,
            ioMeta,
            ioMeta: {
                networkBytes,
                time: { lastReadTS }
            }
        } = item!.value;
        ioMeta.time.lastReadTS = now;
        networkBytes.bytesRead = socket!.bytesRead;
        networkBytes.bytesWritten = socket!.bytesWritten;
        const delay = this.updateActivityWaitTimes(activity, lastReadTS, now);
        return delay;
    }

    private updatePoolWaits(item: List<SocketAttributes>, start: number, stop: number, pool: Pool) {
        const delay = stop - start;
        const bin = this.reduceTimeToPoolBins[pool](delay);
        this.poolWaits[pool][bin] = (this.poolWaits[pool][bin] ?? 0) + 1;
        return delay;
    }

    private decorate(item: Exclude<List<SocketAttributes>, null>) {
        const attr = item.value;
        const socket = attr.socket!;
        const ioMeta = attr.ioMeta;
        const id = ioMeta.id;
        // Writable
        const self = this;
        // finish event indicates that after this side "end()" pun the steam
        // and all pending data has been received by counterparty
        // at the very least it's "readyState" is marked as 'read-only'
        // only when a close event is emitted can we safely say there will be no more data transmitted over the socket
        // 1. end() -> writableEnded=true, writableFinished=false
        // 2. pending write data flushed -> writableFinished=true
        // by definition do not keep writing data after you have ended the stream yourself ofc
        // to only action to be taken here is log the time it took from the last network transmit (send) to when this event occurred
        socket.on('finish', () => {
            const pool = attr.ioMeta.pool.current;
            this.updateNetworkStats(item, 'finish');
        });
        if (ioMeta.timeout) {
            socket.setTimeout(ioMeta.timeout);
            socket.on('timeout', () => {
                const pool = ioMeta.pool.current;
                if (pool === 'idle') {
                    // idling sockets are idle so ofc they will get timeouts
                    ioMeta.idleCounts = 0;
                    return;
                }
                socket.setTimeout(ioMeta.timeout);
                // a timeout received on a socket that is not "idle"
                ioMeta.idleCounts++;
                this.activityEvents.idle++;
                const rc =
                    pool === 'created'
                        ? this.initializer?.handleTimeout(attr)
                        : this.protocolManager?.handleTimeout(attr);
                if (rc === false) {
                    socket.end();
                }
            });
        }
        socket.on('end', () => {
            const pool = ioMeta.pool.current;
            this.updateNetworkStats(item, 'end');
            if (pool === 'created') {
                this.initializer?.handleEnd(item.value);
            } else {
                this.protocolManager?.handleEnd(item.value);
            }
            this.migrateToPool(item, 'terminal');
            this.activityEvents.end++;
        });
        socket.on('drain', () => {
            const pool = ioMeta.pool.current;
            this.updateActivityWaitTimes('drained', this.now(), ioMeta.time.lastWriteTS);
            ioMeta.backPressure.forceResolve(); // unblock if waiting for drainage
        });
        socket.on('data', (buf: Uint8Array) => {
            if (buf.byteLength === 0) {
                return;
            }
            const rc = ioMeta.readable.enqueue(buf);
            if (rc === false) {
                socket.end();
            } else if (rc === true) {
                return; // wait for more data to arrive
            }
        });
        socket.on('error', (err: Error & NodeJS.ErrnoException) => {
            const pool = ioMeta.pool.current;
            const rc =
                pool === 'created'
                    ? this.initializer.handleError(attr, err)
                    : this.protocolManager.handleError(attr, err);
            this.activityEvents.error++;

            const error = err.syscall
                ? { syscall: err.syscall, name: err.name, code: err.code }
                : isAggregateError(err)
                ? Array.from(err.errors).map((err: Error) => ({ message: String(err) }))
                : err.message;

            this.journal.add(id, NOTIFY.SOCKET_ERROR_EVENT, ioMeta.pool.current, rc, error);
            // upper layer want to terminate if connection
            if (rc === false) {
                /*
                    WritableEnded    closed      action
                    F                  F         end(),
                    X                  T         x
                    T                  F         x
                */
                const writableEnded = socket.writableEnded;
                if (!writableEnded && !closed) {
                    socket.end();
                }
            }
        });
        //
        socket.on('close', (hadError) => {
            const pool = ioMeta.pool.current;
            this.activityEvents.close++;
            this.updateNetworkStats(item, 'close');
            if (pool === 'created') {
                this.initializer?.handleClose(attr);
            } else {
                this.protocolManager?.handleClose(attr);
            }
            this.migrateToPool(item, 'terminal');
            this.journal.add(id, NOTIFY.SOCKET_CLOSE_EVENT, ioMeta.pool.current, hadError);
            this.journal.consolidate(id);
            socket.removeAllListeners();
        });
        // use "once" instead of "on", sometimes connect is re-emitted after the connect happens immediatly after a socket disconnect, its weird!
        // todo: observe this occurrance again, this could have been an issue with a tsl upgrade
        socket.once('connect', async () => {
            // trace('connect', id);
            const t0 = attr.ioMeta.time.lastReadTS;
            const t1 = self.markTime(attr);
            self.updateActivityWaitTimes('connect', t0, t1);

            // initializer is like a controller, pass the pipe to this one, or the parser
            // when we switch from initializer to "steady state" operation we pause() the socket then switch, then resume()
            // create a mini agent "boot" for the potential ssl upgrade
            // actor boot (ssl upgrade only)
            // actor authenticate
            // actor prepare queries
            // actor idle (listen to notification)
            // actor query
            const rc = await this.initializer.onConnect(attr);

            const t2 = self.markTime(attr);
            self.updateActivityWaitTimes('iom_code', t1, t2);
            if (rc === false) {
                socket.end();
                return;
            }
        });
        // use "once" instead of "on", sometimes connect is re-emitted after the connect happens immediatly after a socket disconnect, its weird!
        // todo, validate this again
        // what is the order 'connect','lookup', 'ready' document please for linux and windows
        // socket.once('ready', (...args: unknown[]) => {
        // });
        socket.on('lookup', (err, address, family, host) => {
            if (err) {
                this.journal.add(id, NOTIFY.ERROR_COULD_NOT_RESOLVE_HOST, err, address, family, host);
            }
        });
    }
    /*
    private async processData(item: Exclude<List<SocketAttributes>, null>): Promise<boolean> {
        this.updateNetworkStats(item);
        const {
            value: attr,
            value: {
                ioMeta,
                ioMeta: {
                    id,
                    time: { ts: start },
                    pool: { current: pool }
                }
            }
        } = item;
        let rc: boolean | 'done' = false;
        if (pool === 'created') {
            rc = await this.initializer.handleData(attr);
            if (rc === 'done') {
                const { current: srcPool, createdFor: targetPool } = ioMeta.pool;
                this.migrateToPool(item, targetPool);
                const stop = this.markTime(attr);
                this.updateActivityWaitTimes('iom_code', start, stop);
                this.journal.add(id, NOTIFY.PG_INITIALIZATION_COMPLETE);
                return true;
            }
            return rc;
        }
        rc = this.protocolManager.binDump(attr);
        const stop = this.markTime(attr);
        this.updateActivityWaitTimes('iom_code', start, stop);
        return rc;
    }
    */

    public setEnableTimeout(item: SocketAttributes): void {
        const socket = item.socket;
        socket?.setTimeout(item.ioMeta.timeout);
    }

    public upgradeToSSL(
        item: Exclude<List<SocketAttributes>, null>,
        socketSSLFactory: () => CreateSLLConnection,
        sslOptions: PGSSLConfig
    ) {
        const attr = item.value;
        const id = attr.ioMeta.id;
        const ssl = structuredClone(sslOptions);
        ssl.socket = attr.socket!;
        attr.socket!.removeAllListeners();

        const sslSocket = socketSSLFactory()(ssl); // this call takes 29ms
        attr.socket = sslSocket;
        const t0 = this.markTime(attr);
        // todo: add pipe here aswell
        this.decorate(item);
        sslSocket.on('secureConnect', async () => {
            //trace('secureConnect', id, sslSocket.authorized, sslSocket.authorizationError);
            const t1 = this.markTime(attr);
            this.updateActivityWaitTimes('sslConnect', t0, t1);

            await this.initializer!.startupAfterSSLConnect(attr);

            const t2 = this.markTime(attr);
            this.updateActivityWaitTimes('iom_code', t1, t2);
        });
        sslSocket.on('tlsClientError', (exception: Error) => {
            //trace('tlsClientError', id, exception);
        });
        sslSocket.on('error', (error: Error) => {
            //trace('errorssl', id, error);
        });
    }

    public async createSocket(
        socketFactory: () => CreateSocketConnection,
        socketOptions: SocketConnectOpts,
        extraOptions: SocketOtherOptions,
        forPool: PoolFirstResidence
    ) {
        const placementTime = this.now();
        const jitter = this.jitter.getRandomDelayInMs();

        // wait daily ms
        await delayMillis(jitter);

        // action network connection is made
        const socket = socketFactory()(socketOptions);

        const attr: Partial<SocketAttributes> = {
            socket
        };
        const ioMeta: SocketAttributes['ioMeta'] = {
            id: new Number(this.socketId++),
            jitter,
            pool: {
                placementTime,
                createdFor: forPool,
                lastChecked: placementTime,
                current: 'created'
            },
            time: {
                lastReadTS: placementTime,
                lastWriteTS: placementTime
            },
            networkBytes: {
                bytesRead: 0,
                bytesWritten: 0
            },
            backPressure: createResolvePromiseExtended(true),
            idleCounts: 0,
            // readable: new ReadableByteStream(this.initializer.getBytes2MessageParser(attr as SocketAttributes)),
            timeout: extraOptions.timeout
        };
        attr.ioMeta = ioMeta;
        const item: List<SocketAttributes> = { value: attr as SocketAttributes };
        // todo: create here the pipe, pass it as an argument to decorate
        this.decorate(item);
        this.residencies.created = insertBefore(this.residencies.created, item);
    }

    public send(attributes: SocketAttributes, bin: Uint8Array): SendingStatus {
        const socket = attributes.socket!;
        const id = attributes.ioMeta.id;
        if (socket.closed) {
            return SEND_STATUS_CLOSED; // this socket is closed
        }
        if (socket.writableEnded || socket.writableFinished) {
            return SEND_STATUS_ONLY_READ; // this socket not closed but not usefull for writing
        }
        if (socket.writableNeedDrain) {
            return SEND_STATUS_BACKPRESSURE; // return status for backpressure
        }
        const rc = socket.write(bin);
        // create promise for backPressure
        if (rc === false) {
            attributes.ioMeta.backPressure = createResolvePromiseExtended(rc);
            attributes.ioMeta.time.lastWriteTS = this.now();
        }
        return rc === true ? SEND_STATUS_OK : SEND_STATUS_OK_WITH_BACKPRESSURE; // return OK status
    }

    public getActivityWaits(): ActivityWaitTimes {
        return {
            network: { ...this.activityWaits.network },
            iom_code: { ...this.activityWaits.iom_code },
            connect: { ...this.activityWaits.connect },
            sslConnect: { ...this.activityWaits.sslConnect },
            finish: { ...this.activityWaits.finish },
            end: { ...this.activityWaits.end },
            close: { ...this.activityWaits.close },
            drained: { ...this.activityWaits.drained }
        };
    }

    // this is very expensive since it has to scan a list to get a count
    public getPoolResidencies(): ResidencyCount {
        return {
            active: count(this.residencies.active),
            vis: count(this.residencies.vis),
            reservedPermanent: count(this.residencies.reservedPermanent),
            reservedEmpherical: count(this.residencies.reservedEmpherical),
            idle: count(this.residencies.idle),
            created: count(this.residencies.created),
            terminal: count(this.residencies.terminal)
        };
    }

    public getPoolWaitTimes(): PoolWaitTimes {
        return {
            active: Object.assign({}, this.poolWaits.active),
            vis: Object.assign({}, this.poolWaits.vis),
            reservedPermanent: Object.assign({}, this.poolWaits.reservedPermanent),
            reservedEmpherical: Object.assign({}, this.poolWaits.reservedEmpherical),
            idle: Object.assign({}, this.poolWaits.idle),
            terminal: Object.assign({}, this.poolWaits.terminal),
            created: Object.assign({}, this.poolWaits.created)
        };
    }
}
