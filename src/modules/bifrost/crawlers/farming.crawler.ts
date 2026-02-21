import { Injectable, Logger } from '@nestjs/common';
import { BaseApiCrawler } from '../../../shared/crawlers/base-api.crawler';
import { PoolConfigService } from '../../../shared/services/pool-config.service';
import { Protocol, Network, PoolType, ProtocolSnapshot } from '../../../shared/entities/protocol-snapshot.entity';

// ─── Bifrost API Response Types ───────────────────────────────────────────────

interface BifrostOmniItem {
    date: number; // unix timestamp (ms)
    avg: number;  // daily average APY %
    week?: number;
    month?: number;
    quarter?: number;
}

// Raw unit per token passed from fetchRaw → toSnapshot
interface RawFarmingToken {
    token: string; // e.g. 'vDOT'
    latestApy: number;
    history: BifrostOmniItem[];
}

// ─── Exported Types ───────────────────────────────────────────────────────────

export interface FarmingItem {
    token: string;
    apy: number;
}

// ─── Crawler ─────────────────────────────────────────────────────────────────

/**
 * FarmingCrawler — fetches latest farming APY from `dapi.bifrost.io/api/omni/{SYMBOL}`.
 *
 * Unlike VStakingCrawler, farming APY is volatile so we only record the
 * *latest* data point (no history). Each token becomes one ProtocolSnapshot.
 */
@Injectable()
export class FarmingCrawler extends BaseApiCrawler<RawFarmingToken> {
    protected readonly logger = new Logger(FarmingCrawler.name);
    protected readonly protocol = Protocol.BIFROST;
    protected readonly network = Network.POLKADOT;
    protected readonly poolType = PoolType.FARMING;

    private readonly apiBase = 'https://dapi.bifrost.io/api/omni';

    constructor(private readonly poolConfig: PoolConfigService) {
        super();
    }

    protected async fetchRaw(): Promise<RawFarmingToken[]> {
        const tokens = this.poolConfig.getTokens('bifrost', this.network, 'farming');
        const results: RawFarmingToken[] = [];

        for (const token of tokens) {
            const symbol = token.replace(/^v/, ''); // vDOT → DOT
            const url = `${this.apiBase}/${symbol}`;
            this.logger.log(`🌐 Fetching: ${url}`);

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    this.logger.warn(`❌ HTTP ${response.status} for ${token}: ${response.statusText}`);
                    continue;
                }

                const json = await response.json() as { result?: BifrostOmniItem[] };

                if (json.result && Array.isArray(json.result) && json.result.length > 0) {
                    const sorted = [...json.result].sort((a, b) => a.date - b.date);
                    const latest = sorted[sorted.length - 1];

                    if (typeof latest.avg === 'number') {
                        results.push({
                            token,
                            latestApy: latest.avg,
                            history: sorted,
                        });
                        this.logger.log(`✅ ${token}: ${latest.avg.toFixed(2)}%`);
                    } else {
                        this.logger.warn(`⚠️ No valid avg APY for ${token}`);
                    }
                } else {
                    this.logger.warn(`⚠️ Empty result for ${token}`);
                }
            } catch (error) {
                this.logger.error(`❌ Failed ${token}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return results;
    }

    protected toSnapshot(raw: RawFarmingToken): ProtocolSnapshot {
        return {
            protocol: this.protocol,
            network: this.network,
            poolType: this.poolType,
            assetSymbol: raw.token,
            supplyApy: raw.latestApy,
            dataTimestamp: new Date(),
            crawledAt: new Date(),
            metadata: {
                // Preserving history for simulation distribution modeling
                // even though farming APY is volatile.
                history: raw.history.map(h => ({
                    date: h.date,
                    avgApy: h.avg,
                    weekApy: h.week,
                }))
            },
        };
    }
}
