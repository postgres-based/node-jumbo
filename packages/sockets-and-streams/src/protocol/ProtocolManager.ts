import SocketIOManager from '../io/SocketIOManager';
import { SocketAttributes } from '../io/types';
import { GetClientConfig, PGConfig, SetClientConfig } from './types';
import { normalizePGConfig, validatePGConnectionParams } from './helpers';
import { SocketAttributeAuxMetadata } from '../initializer/types';

export default class ProtocolManager {
    constructor(
        private readonly socketIOManager: SocketIOManager,
        private readonly getClientConfig: GetClientConfig
    ) {
        this.socketIOManager.setProtocolManager(this);
    }

    handleTimeout(item: SocketAttributes<SocketAttributeAuxMetadata>): boolean {
        return true;
    }

    public handleEnd(item: SocketAttributes<SocketAttributeAuxMetadata>): boolean {
        return true;
    }

    public binDump(item: SocketAttributes<SocketAttributeAuxMetadata>, data: Uint8Array): boolean {
        return false;
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
