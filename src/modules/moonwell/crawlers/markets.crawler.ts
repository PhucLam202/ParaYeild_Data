import { Injectable, Logger } from '@nestjs/common';
import { BaseApiCrawler } from '../../../shared/crawlers/base-api.crawler';
import { PoolConfigService } from '../../../shared/services/pool-config.service';
import { Protocol, Network, PoolType, ProtocolSnapshot } from '../../../shared/entities/protocol-snapshot.entity';
import { MOONWELL_CHAIN_NETWORK } from '../types/moonwell.types';

// ─── Ponder GraphQL Response Types ───────────────────────────────────────────

interface PonderMarket {
    id: string;
    address: string;
    chainId: number;
    underlyingTokenAddress: string;
    collateralFactor: number;
    reserveFactor: string | number; // BigInt in GraphQL → comes as string
}

interface PonderToken {
    id: string;
    address: string;
    chainId: number;
    symbol: string;
    name: string;
}

interface PonderMarketDailySnapshot {
    id: string;
    chainId: number;
    marketAddress: string;
    totalSuppliesUSD: number;
    totalBorrowsUSD: number;
    totalLiquidityUSD: number;
    baseSupplyApy: number;  // raw decimal, e.g. 0.05 = 5%
    baseBorrowApy: number;
    timestamp: number;
}

// Joined record passed fetchRaw → toSnapshot
interface RawMoonwellMarket {
    market: PonderMarket;
    token: PonderToken | null;
    latestSnapshot: PonderMarketDailySnapshot | null;
}

// ─── Target Chains ────────────────────────────────────────────────────────────

const TARGET_CHAIN_IDS = [1284]; // Moonbeam only

// ─── Crawler ─────────────────────────────────────────────────────────────────

/**
 * MoonwellMarketsCrawler
 *
 * Fetches Moonwell lending market data via the Ponder GraphQL API.
 * Three queries are parallelised: markets, tokens, latest snapshots.
 * Results are joined in memory by (chainId, marketAddress).
 *
 * API: https://ponder.moonwell.fi/  (GraphQL)
 */
@Injectable()
export class MoonwellMarketsCrawler extends BaseApiCrawler<RawMoonwellMarket> {
    protected readonly logger = new Logger(MoonwellMarketsCrawler.name);
    protected readonly protocol = Protocol.MOONWELL;
    protected readonly poolType = PoolType.LENDING;
    protected readonly network = Network.MOONBEAM; // default; overridden per-snapshot

    private readonly ponderUrl = 'https://ponder.moonwell.fi/';

    constructor(private readonly poolConfig: PoolConfigService) {
        super();
    }

    // ─── GraphQL Helper ───────────────────────────────────────────────────────

    private async gql<T>(query: string): Promise<T> {
        const res = await fetch(this.ponderUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        if (!res.ok) throw new Error(`Ponder HTTP ${res.status}: ${res.statusText}`);
        const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
        if (json.errors?.length) throw new Error(`GraphQL error: ${json.errors[0].message}`);
        if (!json.data) throw new Error('No data in GraphQL response');
        return json.data;
    }

    // ─── fetchRaw ─────────────────────────────────────────────────────────────

    protected async fetchRaw(): Promise<RawMoonwellMarket[]> {
        this.logger.log('� Querying Ponder GraphQL (markets + tokens + snapshots)...');

        // 1. Fetch all markets (filtered to target chains in-memory)
        // 2. Fetch all tokens for lookup
        // 3. Fetch latest daily snapshots
        const [marketsData, tokensData, snapshotsData] = await Promise.all([
            this.gql<{ markets: { items: PonderMarket[] } }>(`{
                markets(limit: 200) {
                    items { id address chainId underlyingTokenAddress collateralFactor reserveFactor }
                }
            }`),
            this.gql<{ tokens: { items: PonderToken[] } }>(`{
                tokens(limit: 500) {
                    items { id address chainId symbol name }
                }
            }`),
            this.gql<{ marketDailySnapshots: { items: PonderMarketDailySnapshot[] } }>(`{
                marketDailySnapshots(
                    limit: 200
                    orderBy: "timestamp"
                    orderDirection: "desc"
                ) {
                    items {
                        id chainId marketAddress
                        totalSuppliesUSD totalBorrowsUSD totalLiquidityUSD
                        baseSupplyApy baseBorrowApy timestamp
                    }
                }
            }`),
        ]);

        // Filter to target chains
        const markets = marketsData.markets.items.filter(
            (m) => TARGET_CHAIN_IDS.includes(m.chainId),
        );
        this.logger.log(`🔍 Markets on target chains: ${markets.length}`);

        // Build lookup maps
        const tokenMap = new Map<string, PonderToken>();
        for (const token of tokensData.tokens.items) {
            const key = `${token.chainId}-${token.address.toLowerCase()}`;
            tokenMap.set(key, token);
        }

        // Keep only the LATEST snapshot per (chainId, marketAddress)
        const snapshotMap = new Map<string, PonderMarketDailySnapshot>();
        for (const snap of snapshotsData.marketDailySnapshots.items) {
            if (!TARGET_CHAIN_IDS.includes(snap.chainId)) continue;
            const key = `${snap.chainId}-${snap.marketAddress.toLowerCase()}`;
            const existing = snapshotMap.get(key);
            if (!existing || snap.timestamp > existing.timestamp) {
                snapshotMap.set(key, snap);
            }
        }

        // Join
        return markets.map((market) => {
            const tokenKey = `${market.chainId}-${market.underlyingTokenAddress.toLowerCase()}`;
            const snapKey = `${market.chainId}-${market.address.toLowerCase()}`;
            return {
                market,
                token: tokenMap.get(tokenKey) ?? null,
                latestSnapshot: snapshotMap.get(snapKey) ?? null,
            };
        });
    }

    // ─── toSnapshot ───────────────────────────────────────────────────────────

    protected toSnapshot(raw: RawMoonwellMarket): ProtocolSnapshot {
        const { market, token, latestSnapshot } = raw;

        const network = MOONWELL_CHAIN_NETWORK[market.chainId] ?? `chain-${market.chainId}`;
        const assetSymbol = token?.symbol ?? `unknown-${market.underlyingTokenAddress.slice(0, 8)}`;

        // APY from Ponder is inconsistent:
        // Some assets (e.g. USDC) are raw decimals: 0.05 = 5%
        // Some assets (e.g. GLMR) are already percentages: 118.34 = 118%
        // We normalize to percentage points: 5.0 (for 5%)
        const normalizeApy = (val: number | undefined, label: string) => {
            if (val === undefined || val === null) return undefined;

            if (val > 0) {
                this.logger.debug(`📊 ${assetSymbol} raw ${label}: ${val}`);
            }

            // Ponder API convention:
            // - Stablecoins return small decimals (e.g., 0.05 = 5%)
            // - Volatile assets return percentages (e.g., 118.34 = 118.34%)
            // Threshold: values < 1 are definitely decimals; >= 1 are percentages
            if (val < 1) {
                return val * 100;
            }

            // Warn on ambiguous range (1-5) where convention is uncertain
            if (val >= 1 && val <= 5) {
                this.logger.warn(
                    `⚠️ ${assetSymbol} ${label}=${val} in ambiguous range [1-5] — treating as percentage`,
                );
            }

            return val;
        };
        const supplyApy = normalizeApy(latestSnapshot?.baseSupplyApy, 'baseSupplyApy');
        const borrowApy = normalizeApy(latestSnapshot?.baseBorrowApy, 'baseBorrowApy');

        const utilizationRate = latestSnapshot && latestSnapshot.totalSuppliesUSD > 0
            ? latestSnapshot.totalBorrowsUSD / latestSnapshot.totalSuppliesUSD
            : undefined;

        return {
            protocol: this.protocol,
            network,
            poolType: this.poolType,
            assetSymbol,
            supplyApy,
            borrowApy,
            tvlUsd: latestSnapshot?.totalLiquidityUSD,
            utilizationRate,
            dataTimestamp: latestSnapshot ? new Date(latestSnapshot.timestamp * 1000) : new Date(),
            crawledAt: new Date(),
            metadata: {
                marketAddress: market.address,
                underlyingTokenAddress: market.underlyingTokenAddress,
                chainId: market.chainId,
                collateralFactor: market.collateralFactor,
                reserveFactor: market.reserveFactor,
                totalSuppliesUSD: latestSnapshot?.totalSuppliesUSD,
                totalBorrowsUSD: latestSnapshot?.totalBorrowsUSD,
                snapshotTimestamp: latestSnapshot?.timestamp,
                tokenName: token?.name,
                rawBaseSupplyApy: latestSnapshot?.baseSupplyApy,
                rawBaseBorrowApy: latestSnapshot?.baseBorrowApy,
            },
        };
    }
}
