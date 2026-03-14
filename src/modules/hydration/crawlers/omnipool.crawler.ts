import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Protocol, Network, PoolType, ProtocolSnapshot } from '../../../shared/entities/protocol-snapshot.entity';
import { CrawlResult } from '../../../shared/crawlers/base-api.crawler';
import { scrapeHydrationVolumes } from '../helpers/volume-scraper';

// ─── Constants ───────────────────────────────────────────────────────────────

const RPC_ENDPOINTS = [
    'wss://rpc.hydradx.cloud',
    'wss://hydration-rpc.n.dwellir.com',
    'wss://rpc.hydration.net',
];

/** USDT asset ID on Hydration — used as USD reference for spot prices */
const USDT_ASSET_ID = '10';

const WS_TIMEOUT_MS = 60_000;

// ─── Crawler ─────────────────────────────────────────────────────────────────

/**
 * HydrationOmnipoolCrawler
 *
 * Uses @galacticcouncil/sdk to fetch all Hydration pools (Omnipool, Stableswap,
 * XYK, Aave, HSM) via WebSocket RPC. Calculates TVL from spot prices and
 * fetches farm APRs via FarmClient.
 *
 * Volume data is scraped from the Hydration UI as a best-effort supplement.
 */
@Injectable()
export class HydrationOmnipoolCrawler implements OnModuleDestroy {
    private readonly logger = new Logger(HydrationOmnipoolCrawler.name);
    private api: ApiPromise | null = null;

    async onModuleDestroy(): Promise<void> {
        if (this.api?.isConnected) {
            await this.api.disconnect();
            this.api = null;
        }
    }

    // ─── Main entry point ────────────────────────────────────────────────────

    async crawl(): Promise<CrawlResult<ProtocolSnapshot>> {
        const startTime = Date.now();
        this.logger.log('🚀 [hydration/hydration/dex] Starting SDK-based crawl');

        let api: ApiPromise | null = null;
        let sdk: any = null;

        try {
            // 1. Connect WebSocket
            this.logger.log('🔗 Connecting to Hydration RPC...');
            const wsProvider = new WsProvider(RPC_ENDPOINTS[0], 2_500, {}, WS_TIMEOUT_MS);
            api = await ApiPromise.create({ provider: wsProvider });
            this.api = api;
            this.logger.log(`✅ Connected to: ${(await api.rpc.system.chain()).toString()}`);

            // 2. Create SDK context + FarmClient (ESM dynamic imports)
            const { createSdkContext, FarmClient } = await import('@galacticcouncil/sdk');
            sdk = createSdkContext(api);
            const farmClient = new FarmClient(api);

            // 3. Get all pools
            const pools: any[] = await sdk.ctx.pool.getPools();
            this.logger.log(`🔍 Found ${pools.length} pools`);

            // 4. Fetch spot prices (all unique tokens → USDT)
            const spotPrices = await this.fetchSpotPrices(sdk, pools);

            // 5. Fetch farm APRs
            const farmAprs = await this.fetchFarmAprs(farmClient, pools);

            // 6. Scrape volumes (graceful fallback)
            const volumes = await this.fetchVolumes();

            // 7. Build snapshots
            const data = this.buildSnapshots(pools, spotPrices, farmAprs, volumes);
            this.logger.log(`✅ Crawl complete — ${data.length} snapshots`);

            const duration = Date.now() - startTime;
            return {
                protocol: Protocol.HYDRATION,
                network: Network.HYDRATION,
                poolType: PoolType.DEX,
                timestamp: new Date().toISOString(),
                duration,
                itemsFound: data.length,
                data,
            };
        } catch (error) {
            this.logger.error(
                `❌ Crawl failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        } finally {
            if (sdk) {
                try { sdk.destroy(); } catch { /* ignore */ }
            }
            if (api?.isConnected) {
                await api.disconnect();
            }
            this.api = null;
        }
    }

    // ─── Spot Prices ─────────────────────────────────────────────────────────

    private async fetchSpotPrices(
        sdk: any,
        pools: any[],
    ): Promise<Map<string, number>> {
        this.logger.log('💰 Fetching spot prices vs USDT...');
        const spotPrices = new Map<string, number>();
        spotPrices.set(USDT_ASSET_ID, 1.0);

        // Collect unique token IDs
        const tokenIds = new Set<string>();
        for (const pool of pools) {
            pool.tokens?.forEach((t: any) => {
                if (t.id) tokenIds.add(t.id);
            });
        }

        let fetched = 0;
        let failed = 0;
        for (const tokenId of tokenIds) {
            if (spotPrices.has(tokenId)) continue;
            try {
                const price = await sdk.api.router.getBestSpotPrice(
                    tokenId,
                    USDT_ASSET_ID,
                );
                if (price) {
                    const priceNum = Number(price.amount) / 10 ** price.decimals;
                    spotPrices.set(tokenId, priceNum);
                    fetched++;
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        }

        this.logger.log(`  Prices fetched: ${fetched}, unavailable: ${failed}`);
        return spotPrices;
    }

    // ─── Farm APRs ───────────────────────────────────────────────────────────

    private async fetchFarmAprs(
        farmClient: any,
        pools: any[],
    ): Promise<Map<string, string>> {
        this.logger.log('🌾 Fetching farm APRs...');
        const farmAprs = new Map<string, string>();

        // Omnipool tokens
        const omnipools = pools.filter((p: any) => p.type === 'Omnipool');
        const omnipoolTokenIds = new Set<string>();
        for (const pool of omnipools) {
            pool.tokens?.forEach((t: any) => {
                if (t.id) omnipoolTokenIds.add(t.id);
            });
        }

        let omniFarms = 0;
        for (const assetId of omnipoolTokenIds) {
            try {
                const apr = await farmClient.getFarmApr(assetId, 'omnipool');
                if (apr) {
                    farmAprs.set(`omnipool:${assetId}`, apr);
                    omniFarms++;
                }
            } catch {
                // No farm for this asset
            }
        }
        this.logger.log(`  Omnipool farm APRs: ${omniFarms}/${omnipoolTokenIds.size}`);

        // Isolated pools (Stableswap, XYK)
        const isolatedPools = pools.filter(
            (p: any) => p.type === 'Stableswap' || p.type === 'Xyk',
        );
        let isolatedFarms = 0;
        for (const pool of isolatedPools) {
            try {
                const apr = await farmClient.getFarmApr(pool.address, 'isolatedpool');
                if (apr) {
                    farmAprs.set(`isolated:${pool.address}`, apr);
                    isolatedFarms++;
                }
            } catch {
                // No farm
            }
        }
        this.logger.log(`  Isolated pool farm APRs: ${isolatedFarms}/${isolatedPools.length}`);

        return farmAprs;
    }

    // ─── Volumes ─────────────────────────────────────────────────────────────

    private async fetchVolumes(): Promise<Map<string, number>> {
        this.logger.log('📊 Scraping 24H volumes from UI...');
        try {
            return await scrapeHydrationVolumes();
        } catch (error) {
            this.logger.warn(
                `⚠️ Volume scrape failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return new Map();
        }
    }

    // ─── Build Snapshots ─────────────────────────────────────────────────────

    private buildSnapshots(
        pools: any[],
        spotPrices: Map<string, number>,
        farmAprs: Map<string, string>,
        volumes: Map<string, number>,
    ): ProtocolSnapshot[] {
        const snapshots: ProtocolSnapshot[] = [];
        const now = new Date();

        for (const pool of pools) {
            if (pool.type === 'Omnipool') {
                // 1 snapshot per token in the Omnipool
                for (const token of pool.tokens || []) {
                    const symbol = token.symbol || `asset-${token.id}`;
                    const decimals = token.decimals || 12;
                    const balance = Number(token.balance) / 10 ** decimals;
                    const price = spotPrices.get(token.id) || 0;
                    const tvlUsd = balance * price;

                    const farmAprStr = farmAprs.get(`omnipool:${token.id}`);
                    const totalApy = farmAprStr
                        ? parseFloat(farmAprStr)
                        : undefined;

                    const volume24hUsd = volumes.get(symbol);

                    snapshots.push({
                        protocol: Protocol.HYDRATION,
                        network: Network.HYDRATION,
                        poolType: PoolType.DEX,
                        assetSymbol: symbol,
                        totalApy,
                        tvlUsd: tvlUsd > 0 ? tvlUsd : undefined,
                        dataTimestamp: now,
                        crawledAt: now,
                        metadata: {
                            poolCategory: 'Omnipool',
                            priceUsd: price > 0 ? price : undefined,
                            poolAddress: pool.address,
                            assetId: token.id,
                            volume24hUsd,
                            balance,
                        },
                    } as ProtocolSnapshot);
                }
            } else {
                // Multi-token pools: Stableswap, Xyk, Aave, Hsm
                const tokenSymbols = (pool.tokens || [])
                    .map((t: any) => t.symbol || `asset-${t.id}`)
                    .join('/');
                const assetSymbol = tokenSymbols || `pool-${pool.address}`;

                // Calculate TVL as sum of all token values
                let tvlUsd = 0;
                for (const token of pool.tokens || []) {
                    const decimals = token.decimals || 12;
                    const balance = Number(token.balance) / 10 ** decimals;
                    const price = spotPrices.get(token.id) || 0;
                    tvlUsd += balance * price;
                }

                const farmAprStr = farmAprs.get(`isolated:${pool.address}`);
                const totalApy = farmAprStr
                    ? parseFloat(farmAprStr)
                    : undefined;

                const volume24hUsd = volumes.get(assetSymbol);

                snapshots.push({
                    protocol: Protocol.HYDRATION,
                    network: Network.HYDRATION,
                    poolType: PoolType.DEX,
                    assetSymbol,
                    totalApy,
                    tvlUsd: tvlUsd > 0 ? tvlUsd : undefined,
                    dataTimestamp: now,
                    crawledAt: now,
                    metadata: {
                        poolCategory: pool.type || 'Unknown',
                        poolAddress: pool.address,
                        volume24hUsd,
                        tokens: (pool.tokens || []).map((t: any) => ({
                            id: t.id,
                            symbol: t.symbol,
                            decimals: t.decimals,
                            priceUsd: spotPrices.get(t.id),
                        })),
                    },
                } as ProtocolSnapshot);
            }
        }

        return snapshots;
    }
}
