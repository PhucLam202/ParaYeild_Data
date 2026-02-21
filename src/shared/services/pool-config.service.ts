import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Generic pool config entry. Each protocol uses different fields,
 * so this is intentionally flexible (tokens[], chainId, apiBase, url, …).
 */
export type PoolConfig = Record<string, unknown> & {
    tokens?: string[];
    url?: string;
    chainId?: number;
    apiBase?: string;
    pageWaitMs?: number;
};

export type NetworkConfig = Record<string, PoolConfig | undefined>;
export type ProtocolConfig = Record<string, NetworkConfig>;
export type PoolsConfig = Record<string, ProtocolConfig>;

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * PoolConfigService — reads `config/pools.yaml` at startup.
 *
 * Provides typed accessors for protocol/network/pool configuration.
 * Hot-reload supported via `reloadConfig()`.
 *
 * YAML structure:
 * ```yaml
 * {protocol}:
 *   {network}:
 *     {poolType}:
 *       tokens: [...]    # optional
 *       chainId: 1284    # optional
 *       apiBase: ...     # optional
 * ```
 *
 * Usage:
 *   this.poolConfig.getTokens('bifrost', 'polkadot', 'vstaking')
 *   this.poolConfig.get<{ chainId: number }>('moonwell', 'moonbeam', 'markets')
 */
@Injectable()
export class PoolConfigService implements OnModuleInit {
    private readonly logger = new Logger(PoolConfigService.name);
    private config: PoolsConfig = {};

    private readonly configPath = path.join(process.cwd(), 'config', 'pools.yaml');

    onModuleInit() {
        this.loadConfig();
    }

    /**
     * Get pool config typed as T.
     * Throws if the path does not exist in the YAML.
     */
    get<T extends PoolConfig = PoolConfig>(
        protocol: string,
        network: string,
        poolType: string,
    ): T {
        const pool = this.config?.[protocol]?.[network]?.[poolType];
        if (!pool) {
            throw new Error(
                `[PoolConfigService] Config not found: ${protocol}/${network}/${poolType}. Check config/pools.yaml.`,
            );
        }
        return pool as T;
    }

    /** Convenience: get the `tokens` array for a pool. */
    getTokens(protocol: string, network: string, poolType: string): string[] {
        return (this.get(protocol, network, poolType).tokens as string[]) ?? [];
    }

    /** Convenience: get the `url` string for a pool. */
    getUrl(protocol: string, network: string, poolType: string): string {
        return this.get(protocol, network, poolType).url as string;
    }

    /** Re-read the YAML from disk (useful in dev without restart). */
    reloadConfig(): void {
        this.loadConfig();
    }

    private loadConfig(): void {
        try {
            if (!fs.existsSync(this.configPath)) {
                this.logger.warn(`⚠️ Pool config not found at: ${this.configPath}`);
                return;
            }
            const raw = fs.readFileSync(this.configPath, 'utf-8');
            this.config = yaml.load(raw) as PoolsConfig;
            this.logger.log(`✅ Pool config loaded: ${this.configPath}`);
        } catch (error) {
            this.logger.error(`❌ Failed to load pool config: ${(error as Error).message}`);
        }
    }
}
