import { Injectable, Logger } from '@nestjs/common';
import { BaseApiCrawler, CrawlResult } from '../../../shared/crawlers/base-api.crawler';
import { PoolConfigService } from '../../../shared/services/pool-config.service';
import { Protocol, Network, PoolType, ProtocolSnapshot } from '../../../shared/entities/protocol-snapshot.entity';

// ─── Bifrost API Response Types ───────────────────────────────────────────────

interface BifrostOmniItem {
    date: number;    // unix timestamp (ms)
    avg: number;     // daily average APY %
    week?: number;   // 7-day rolling APY %
    month?: number;  // 30-day rolling APY %
    quarter?: number; // 90-day rolling APY %
}

// What we pass from fetchRaw → toSnapshot
interface RawVStakingToken {
    token: string;  // e.g. 'vDOT'
    history: BifrostOmniItem[];
}

// ─── Exported Types (used by BifrostService) ─────────────────────────────────

export interface VStakingHistoryItem {
    date: number;
    avgApy: number;
    weekApy?: number;
    monthApy?: number;
    quarterApy?: number;
}

export interface VStakingItem {
    token: string;
    apy: number;          // Latest avgApy for compatibility
    history: VStakingHistoryItem[];
}

// ─── Crawler ─────────────────────────────────────────────────────────────────

/**
 * VStakingCrawler — fetches from `dapi.bifrost.io/api/omni/{SYMBOL}`.
 *
 * Extends BaseApiCrawler. Each vToken (vDOT, vETH, …) becomes a separate
 * ProtocolSnapshot with full APY history stored in `metadata.history`.
 */
@Injectable()
export class VStakingCrawler extends BaseApiCrawler<RawVStakingToken> {
    protected readonly logger = new Logger(VStakingCrawler.name);
    protected readonly protocol = Protocol.BIFROST;
    protected readonly network = Network.POLKADOT;
    protected readonly poolType = PoolType.VSTAKING;

    private readonly apiBase = 'https://dapi.bifrost.io/api/omni';

    constructor(private readonly poolConfig: PoolConfigService) {
        super();
    }

    protected async fetchRaw(): Promise<RawVStakingToken[]> {
        const tokens = this.poolConfig.getTokens('bifrost', this.network, 'vstaking');
        const results: RawVStakingToken[] = [];

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
                    // Sort ascending so history[last] = most recent
                    const sorted = [...json.result].sort((a, b) => a.date - b.date);
                    results.push({ token, history: sorted });
                    this.logger.log(`✅ ${token}: ${sorted.length} history items`);
                } else {
                    this.logger.warn(`⚠️ No result array for ${token}`);
                }
            } catch (error) {
                this.logger.error(`❌ Failed ${token}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return results;
    }

    protected toSnapshot(raw: RawVStakingToken): ProtocolSnapshot {
        const latest = raw.history[raw.history.length - 1];

        const history: VStakingHistoryItem[] = raw.history.map((item) => ({
            date: item.date,
            avgApy: item.avg,
            weekApy: item.week,
            monthApy: item.month,
            quarterApy: item.quarter,
        }));

        return {
            protocol: this.protocol,
            network: this.network,
            poolType: this.poolType,
            assetSymbol: raw.token,
            supplyApy: latest.avg,
            dataTimestamp: new Date(latest.date),
            crawledAt: new Date(),
            metadata: {
                history,
                weekApy: latest.week,
                monthApy: latest.month,
                quarterApy: latest.quarter,
            },
        };
    }
}
