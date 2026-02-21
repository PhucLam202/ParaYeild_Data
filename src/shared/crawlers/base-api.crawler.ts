import { Logger } from '@nestjs/common';
import { ProtocolSnapshot } from '../entities/protocol-snapshot.entity';

// ─── CrawlResult ─────────────────────────────────────────────────────────────

/**
 * Standard result shape returned by every crawler's `crawl()` method.
 * Both BaseCrawler (Playwright) and BaseApiCrawler share this contract.
 */
export interface CrawlResult<T = ProtocolSnapshot> {
    /** The protocol this result came from. */
    protocol: string;

    /** The network/chain crawled. */
    network: string;

    /** The pool type crawled (vstaking | farming | lending | dex…). */
    poolType: string;

    /** ISO timestamp of when the crawl was executed. */
    timestamp: string;

    /** Total duration of the crawl in milliseconds. */
    duration: number;

    /** Number of data items returned. */
    itemsFound: number;

    /** The scraped and normalized data. */
    data: T[];
}

// ─── BaseApiCrawler ───────────────────────────────────────────────────────────

/**
 * Abstract base class for crawlers that use direct REST API calls (no browser).
 *
 * This is the preferred crawler style when a public API is available.
 * For JS-heavy pages without public APIs, use BaseCrawler (Playwright) instead.
 *
 * ## How to implement a new protocol crawler:
 *
 * ```typescript
 * @Injectable()
 * export class MyMarketsCrawler extends BaseApiCrawler<MyRawMarket> {
 *   protected readonly logger = new Logger(MyMarketsCrawler.name);
 *   protected readonly protocol = Protocol.MYPROTOCOL;
 *   protected readonly network = Network.MOONBEAM;
 *   protected readonly poolType = PoolType.LENDING;
 *
 *   protected async fetchRaw(): Promise<MyRawMarket[]> {
 *     const res = await fetch('https://api.myprotocol.com/markets');
 *     const json = await res.json();
 *     return json.markets;
 *   }
 *
 *   protected toSnapshot(raw: MyRawMarket): ProtocolSnapshot {
 *     return {
 *       protocol: this.protocol,
 *       network: this.network,
 *       poolType: this.poolType,
 *       assetSymbol: raw.symbol,
 *       supplyApy: raw.supplyRate,
 *       tvlUsd: raw.totalSupplyUsd,
 *       dataTimestamp: new Date(),
 *       crawledAt: new Date(),
 *       metadata: { /* protocol-specific fields * / },
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseApiCrawler<TRaw> {
    protected abstract readonly logger: Logger;
    protected abstract readonly protocol: string;
    protected abstract readonly network: string;
    protected abstract readonly poolType: string;

    /**
     * Fetch raw data from the protocol's API.
     * Each item returned will be passed to `toSnapshot()`.
     */
    protected abstract fetchRaw(): Promise<TRaw[]>;

    /**
     * Map a single raw API item to the unified `ProtocolSnapshot` shape.
     * This is the only place where protocol-specific mapping logic lives.
     */
    protected abstract toSnapshot(raw: TRaw): ProtocolSnapshot;

    /**
     * Main entry point. Fetches raw data, maps to ProtocolSnapshot[], and returns
     * a standard CrawlResult. Handles timing and error logging automatically.
     */
    async crawl(): Promise<CrawlResult<ProtocolSnapshot>> {
        const startTime = Date.now();
        this.logger.log(`🚀 [${this.protocol}/${this.network}/${this.poolType}] Starting crawl`);

        let data: ProtocolSnapshot[] = [];

        try {
            const raw = await this.fetchRaw();
            data = raw.map((item) => this.toSnapshot(item));
            this.logger.log(`✅ Crawl complete — ${data.length} items`);
        } catch (error) {
            this.logger.error(
                `❌ Crawl failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        }

        const duration = Date.now() - startTime;

        return {
            protocol: this.protocol,
            network: this.network,
            poolType: this.poolType,
            timestamp: new Date().toISOString(),
            duration,
            itemsFound: data.length,
            data,
        };
    }
}
