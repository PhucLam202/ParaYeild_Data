import { Injectable, Logger } from '@nestjs/common';
import { BaseApiCrawler } from '../../../shared/crawlers/base-api.crawler';
import { Protocol, Network, PoolType, ProtocolSnapshot } from '../../../shared/entities/protocol-snapshot.entity';
import {
    RawMoonwellSdkMarket,
    MOONWELL_CHAIN_NETWORK,
    MOONWELL_RPC_CONFIG,
} from '../types/moonwell.types';

// ─── Crawler ─────────────────────────────────────────────────────────────────

/**
 * MoonwellMarketsCrawler
 *
 * Fetches Moonwell lending market data via the official @moonwell-fi/moonwell-sdk.
 * Covers all 3 chains: Moonbeam, Base, Optimism.
 *
 * SDK returns decimal values (0.05 = 5%) — no ambiguous normalization needed.
 */
@Injectable()
export class MoonwellMarketsCrawler extends BaseApiCrawler<RawMoonwellSdkMarket> {
    protected readonly logger = new Logger(MoonwellMarketsCrawler.name);
    protected readonly protocol = Protocol.MOONWELL;
    protected readonly poolType = PoolType.LENDING;
    protected readonly network = Network.MOONBEAM; // default; overridden per-snapshot

    // ─── fetchRaw ─────────────────────────────────────────────────────────────

    protected async fetchRaw(): Promise<RawMoonwellSdkMarket[]> {
        this.logger.log('📡 Fetching markets via Moonwell SDK (3 chains)...');

        // Dynamic import — SDK is ESM-only
        const { createMoonwellClient } = await import('@moonwell-fi/moonwell-sdk');
        const { getMarkets } = await import('@moonwell-fi/moonwell-sdk/actions');

        const client = createMoonwellClient({
            networks: MOONWELL_RPC_CONFIG,
        });

        const markets = await getMarkets(client as any, {
            includeLiquidStakingRewards: true,
        });

        // Filter out deprecated markets
        const active = (markets as unknown as RawMoonwellSdkMarket[]).filter(
            (m) => !m.deprecated,
        );

        this.logger.log(
            `🔍 SDK returned ${markets.length} markets, ${active.length} active`,
        );

        return active;
    }

    // ─── toSnapshot ───────────────────────────────────────────────────────────

    protected toSnapshot(raw: RawMoonwellSdkMarket): ProtocolSnapshot {
        const network =
            MOONWELL_CHAIN_NETWORK[raw.chainId] ?? `chain-${raw.chainId}`;
        const assetSymbol = raw.underlyingToken.symbol;

        // SDK returns decimals: 0.05 = 5%. Multiply by 100 for percentage points.
        const supplyApy = raw.baseSupplyApy * 100;
        const borrowApy = raw.baseBorrowApy * 100;

        // Sum of supply-side reward APRs
        const rewardApy =
            raw.rewards.length > 0
                ? raw.rewards.reduce((sum, r) => sum + (r.supplyApr || 0), 0) * 100
                : undefined;

        // SDK pre-computes totalSupplyApr = base + all rewards
        const totalApy = raw.totalSupplyApr * 100;

        const utilizationRate =
            raw.totalSupplyUsd > 0
                ? raw.totalBorrowsUsd / raw.totalSupplyUsd
                : undefined;

        return {
            protocol: this.protocol,
            network,
            poolType: this.poolType,
            assetSymbol,
            supplyApy,
            borrowApy,
            rewardApy,
            totalApy,
            tvlUsd: raw.totalSupplyUsd,
            utilizationRate,
            dataTimestamp: new Date(),
            crawledAt: new Date(),
            metadata: {
                chainId: raw.chainId,
                marketTokenAddress: raw.marketToken?.address,
                underlyingTokenAddress: raw.underlyingToken.address,
                underlyingPrice: raw.underlyingPrice,
                collateralFactor: raw.collateralFactor,
                reserveFactor: raw.reserveFactor,
                totalBorrowsUsd: raw.totalBorrowsUsd,
                rewards: raw.rewards.map((r) => ({
                    token: r.token.symbol,
                    supplyApr: r.supplyApr,
                    borrowApr: r.borrowApr,
                    liquidStakingApr: r.liquidStakingApr,
                })),
            },
        };
    }
}
