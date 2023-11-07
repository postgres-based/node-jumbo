import type { TcpSocketConnectOpts, IpcSocketConnectOpts, ConnectOpts, Socket, NetConnectOpts } from 'net';
import type SocketIOManager from './SocketIOManager';
import type { ProtocolStateInitial } from '../protocol/types';

export type Pool = 'vis' | 'reservedEmpherical' | 'reservedPermanent' | 'active' | 'idle' | 'terminal' | 'created';
export type Activity = 'network' | 'iom_code';
export type PoolFirstResidence = Exclude<Pool, 'active' | 'terminal' | 'reservedEmpherical' | 'created'>;

export type CreateSocketSpecHints = {
    forPool: PoolFirstResidence;
};

export type SocketOtherOptions = {
    timeout: number;
};

export type CreateSocketConnection = (options: NetConnectOpts) => Socket;

export type CreateSocketSpec = (
    hints: CreateSocketSpecHints,
    setSocketCreator: (createSocket: CreateSocketConnection) => void,
    allOptions: (conOptions: SocketConnectOpts, extraOpt?: SocketOtherOptions) => void
) => void;

export type reduceValueToBin = (value: number) => number;

// define the bin sizes
export type PoolTimeBins = {
    [index in Pool]: reduceValueToBin;
};

export type ActivityTimeBins = {
    [index in Activity]: reduceValueToBin;
};

export type CreateSocketBuffer = () => Uint8Array;

export type MetaSocketAttr = {
    jitter: number; // random delay in ms when connecting
    pool: {
        createdFor: PoolFirstResidence;
        placementTime: number; // when the socket was placed into "pool"
        pool: Pool;
        lastChecked: number;
    };
    networkBytes: {
        ts: number;
        bytesRead: number;
        bytesWritten: number;
    };
    state: {
        protocolState: ProtocolStateInitial;
    };
};

type HistogramResidentTimes = {
    [time: number]: number;
};

export type PoolWaitTimes = {
    [index in Pool]: HistogramResidentTimes;
};

export type ActivityWaitTimes = {
    [index in Activity]: HistogramResidentTimes;
};

export type SocketAttributes = {
    socket: Socket | null;
    meta: MetaSocketAttr;
};

export type SocketConnectOpts = (TcpSocketConnectOpts & ConnectOpts) | (IpcSocketConnectOpts & ConnectOpts);

export interface AggregateError extends Error {
    errors: any[];
}

export interface AggregateErrorConstructor {
    new (errors: Iterable<any>, message?: string): AggregateError;
    (errors: Iterable<any>, message?: string): AggregateError;
    readonly prototype: AggregateError;
}