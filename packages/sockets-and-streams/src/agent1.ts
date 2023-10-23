import { Socket } from 'net';
import type { TcpNetConnectOpts } from 'net';
import testServer from './server-partial';

const portOption = '--connect-port=';

function getPort() {
    const port = process.argv.slice(2).find((opt) => opt.toLocaleLowerCase().startsWith(portOption));
    console.log('port found:', port);
    return port ? parseInt(port.slice(portOption.length)) : NaN;
}
function createTcpNetConnectOpts(): TcpNetConnectOpts | undefined {
    const port = getPort();
    if (isNaN(port)) {
        return undefined;
    }
    return { port };
}

/*
    - fd <number> If specified, wrap around an existing socket with the given file descriptor, otherwise a new socket will be created.
    - allowHalfOpen <boolean> If set to false, then the socket will automatically end the writable side when the readable side ends. See net.createServer() and the 'end' event for details. Default: false.
    - readable <boolean> Allow reads on the socket when an fd is passed, otherwise ignored. Default: false.
    - writable <boolean> Allow writes on the socket when an fd is passed, otherwise ignored. Default: false.
    - signal <AbortSignal> An Abort signal that may be used to destroy the socket.
*/

function isAggregateError(err: unknown): err is AggregateError {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (err as AggregateError)?.errors !== undefined;
}

async function connectToCounterParty() {
    console.log('connecting to counterparty');
    const options = createTcpNetConnectOpts();
    if (!options) {
        return;
    }
    const socket = new Socket();
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    socket.setKeepAlive(true);

    /* stream.Writable events ex sockets */
    socket.on('finish', (...args: unknown[]) => {
        console.log('/finish [%o]', args);
        console.log('readableEnded', socket.readableEnded);
        console.log('writableEnded', socket.writableEnded);
        console.log('writableFinished', socket.writableFinished);
    });

    /* stream.Readable events ex socket */
    // emitted when resume() is called and readableFlowing !== true
    // hence it is switching to "flowing mode"
    socket.on('/resume', (...args: unknown[]) => {
        console.log('/resume [%o]', args);
    });

    // 'pause' event is emitted if stream.Readable.pause() is called AND "readableFlowing" is "true" or "null"
    // stream.Readable.resume() will put the stream into a flowing state (emtting events).
    socket.on('pause', (...args: unknown[]) => {
        console.log('/pause [%o]', args);
    });
    // stream has readable information
    // if 'readable' is registered
    //    if 'data' is also registerd
    //         then readable will  get data via .read(), aswell as emitted via 'data'
    //  'readable' emitted before 'data' or 'end'
    //
    /*
    /readable start
    /data, socket timeout is: 3000
    /data, ended? false
    /data, received type [string], data:['reply: ending socket']
    /readable -> read() -> [reply: ending socket]
    /readable null received
    /readable end
    /readable start
    /readable null received
    /readable end
    */
    socket.on('readable', () => {
        console.log('/readable start, to read:[%s]', socket.readableLength);
        let data: string | undefined | null;
        do {
            data = socket.read() as string;
            if (data === null) {
                console.log('/readable null received');
                continue;
            }
            console.log('/readable -> read() -> [%s]', data);
        } while (data);
        console.log('/readable end');
    });
    /* socket events (read and writable) */
    // Emitted when the other end of the socket signals the end of transmission,
    // (independent of the fact, this side of the connection called "end()")
    socket.on('end', (...args: unknown[]) => {
        console.log('/end [%o]', args);
        console.log('readableEnded', socket.readableEnded);
        console.log('writableEnded', socket.writableEnded);
        console.log('writableFinished', socket.writableFinished);
    });
    socket.on('drain', () => {
        console.log('/drain');
    });
    socket.on('data', (thunk: string) => {
        console.log('/data, socket timeout is:', socket.timeout);
        console.log('/data, ended?', socket.readableEnded);
        console.log('/data, received type [%s], data:[%o]', typeof thunk, thunk);
    });
    socket.on('error', (err: Error & NodeJS.ErrnoException) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        if (err.syscall) {
            console.log('/error occurred [%o]:', { syscall: err.syscall, name: err.name, code: err.code });
            return;
        }
        if (isAggregateError(err)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            const prunedErrors = Array.from(err.errors).map((err: Error) => ({
                message: err.message
            }));
            console.log('/error occurred [%o]:', prunedErrors);
        }
    });
    // timeout has no arguments
    // timeout due to idle does not depend on "keep alive"
    socket.on('timeout', (...args: unknown[]) => {
        console.log('/timeout: [%o]', args);
        // // setting the timeout will re-trigger the timeout again
        // socket.setTimeout(3000);
    });
    socket.on('close', (hadError) => {
        console.log('/close: hadError: [%s]', hadError);
    });
    // there is no argument for "connect" callback
    socket.on('connect', () => {
        console.log('/connect received');
    });
    socket.on('ready', (...args: unknown[]) => {
        console.log('/ready: [%o]', args);
    });
    socket.on('lookup', (...args: unknown[]) => {
        console.log('/lookup: [%o]', args);
    });
    socket.connect(options, () => {
        socket.setTimeout(3000);
        console.log('callback/socket.connect()');
        setTimeout(() => {
            if (socket.writableEnded) {
                console.log('socket already ended, cancel transmission');
                return;
            }
            console.log(':readableEnded', socket.readableEnded);
            console.log(':writableEnded', socket.writableEnded);
            console.log(':writableFinished', socket.writableFinished);
            console.log(':errored', socket.errored);
            console.log(':readyState', socket.readyState);
            console.log(':closed', socket.closed);
            socket.end('e:nding socket');
            console.log(':end event + data sent');
            console.log(':readableEnded', socket.readableEnded);
            console.log(':writableEnded', socket.writableEnded);
            console.log(':writableFinished', socket.writableFinished);
            console.log(':errored', socket.errored);
            console.log(':readyState', socket.readyState);
            console.log(':closed', socket.closed);
            //  https://fr.spankbang.com/4tlyk-cubuu2/playlist/catsuits
        }, 5e3);
    });
}

testServer()
    .then((/*server*/) => {
        return connectToCounterParty();
    })
    .catch((err) => {
        console.log('something bad happened', err);
    });