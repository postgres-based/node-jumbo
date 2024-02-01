import SocketIOManager from '../io/SocketIOManager';
import { SocketAttributes } from '../io/types';
import { GetClientConfig, PGConfig, SetClientConfig } from './types';
import { normalizePGConfig, validatePGConnectionParams } from './helpers';
import { SocketAttributeAuxMetadata } from '../initializer/types';
import { JournalFactory, Journal } from '../journal';
import dump from 'buffer-hexdump';

export function ProtocolManagerFactory(getClientConfig: GetClientConfig) {
    // https://www.measurethat.net/Benchmarks/Show/18003/0/array-vs-object-vs-map-vs-weakmap-access-3
    return function newProtocolManager(
        socketIoManager: SocketIOManager,
        journalFactory: ReturnType<typeof JournalFactory>
    ) {
        return new ProtocolManager(socketIoManager, getClientConfig, journalFactory);
    };
}

export default class ProtocolManager {
    private readonly journal: Journal<ProtocolManager>;

    constructor(
        private readonly socketIOManager: SocketIOManager,
        private readonly getClientConfig: GetClientConfig,
        private readonly journalFactory: ReturnType<typeof JournalFactory>
    ) {
        this.journal = journalFactory(this);
    }

    handleTimeout(item: SocketAttributes<SocketAttributeAuxMetadata>): boolean {
        return true; // handler does not want connection explicitly terminated
    }

    public handleEnd(item: SocketAttributes<SocketAttributeAuxMetadata>): boolean {
        return true; // handler does not want connection explicitly terminated
    }

    public handleError(
        item: SocketAttributes<SocketAttributeAuxMetadata>,
        err: Error & NodeJS.ErrnoException
    ): boolean {
        return true; // handler does not want connection explicitly terminated
    }

    public handleClose(item: SocketAttributes<SocketAttributeAuxMetadata>): void {
        return;
    }

    public binDump(item: SocketAttributes<SocketAttributeAuxMetadata>, data: Uint8Array): boolean {
        console.log(dump(data));
        return true;
    }

    public requestConnectionParams(): { errors: Error[] } | { config: Required<PGConfig> } {
        let config: PGConfig | undefined;
        const setClientConfig: SetClientConfig = ($config: PGConfig) => {
            config = $config;
        };
        this.getClientConfig(setClientConfig);
        const result = validatePGConnectionParams(config);
        if (result === true) {
            const configFinal = normalizePGConfig(config!);
            return { config: configFinal };
        }
        return { errors: result.errors };
    }

    public parseSQL(text: string) {}
}
