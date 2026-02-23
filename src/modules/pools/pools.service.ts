import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import {
    BifrostSnapshot,
    MoonwellSnapshot,
    HydrationSnapshot,
    BaseProtocolSnapshot,
} from '../../shared/entities/protocol-snapshot.entity';
import { PoolFilterDto, SortBy } from './dto/pool-filter.dto';

// ─── Unified API Response Shape ───────────────────────────────────────────────
/**
 * Normalized response schema for all protocols.
 * All protocols produce the same fields — missing values are undefined / null.
 */
export interface PoolSummary {
    // ── Identification ──────────────────────────────────────────────────────
    protocol: string;            // "bifrost" | "moonwell" | "hydration"
    network: string;             // "polkadot" | "moonbeam" | "base" | ...
    poolType: string;            // "vstaking" | "farming" | "lending" | "dex"
    assetSymbol: string;         // "vDOT", "USDC", "DOT" ...
    snapshotDate?: string;       // "2026-02-23" (UTC day key)

    // ── APY / APR ───────────────────────────────────────────────────────────
    supplyApy?: number;          // Bifrost vStaking supplyApy / Moonwell supply APY (%)
    borrowApy?: number;          // Moonwell borrow APY (%)
    rewardApy?: number;          // Extra incentive APY (%)
    totalApy?: number;           // Hydration fee+farm APR, or sum where applicable

    // ── Market Size ─────────────────────────────────────────────────────────
    tvlUsd?: number;             // Total Value Locked (USD)
    utilizationRate?: number;    // Moonwell borrow utilization ratio (0-1)
    volume24hUsd?: number;       // Hydration 24h trading volume (USD)
    priceUsd?: number;           // Hydration asset price (USD)

    // ── Bifrost-specific rolling windows ────────────────────────────────────
    weekApy?: number;            // 7-day rolling APY (%)
    monthApy?: number;           // 30-day rolling APY (%)
    quarterApy?: number;         // 90-day rolling APY (%)

    // ── Moonwell-specific market info ────────────────────────────────────────
    marketAddress?: string;      // Moonwell market contract address
    chainId?: number;            // EVM chain ID (1284 = Moonbeam, 8453 = Base)
    collateralFactor?: number;   // Moonwell collateral factor
    reserveFactor?: string | number; // Moonwell reserve factor

    // ── Hydration-specific pool info ─────────────────────────────────────────
    poolCategory?: string;       // "omnipool" | "stablepool"
    assetName?: string;          // Hydration full asset name e.g. "GigaDOT"
    feeAndFarmApr?: number;      // Hydration raw combined APR (%)

    // ── Time tracking ────────────────────────────────────────────────────────
    dataTimestamp: Date;         // Actual timestamp of the source data point
    updatedAt?: Date;            // Last time the cron job wrote this record
}

@Injectable()
export class PoolsService {
    private readonly logger = new Logger(PoolsService.name);

    constructor(
        @InjectRepository(BifrostSnapshot)
        private readonly bifrostRepo: MongoRepository<BifrostSnapshot>,
        @InjectRepository(MoonwellSnapshot)
        private readonly moonwellRepo: MongoRepository<MoonwellSnapshot>,
        @InjectRepository(HydrationSnapshot)
        private readonly hydrationRepo: MongoRepository<HydrationSnapshot>,
    ) { }

    /**
     * Returns the latest snapshot per (assetSymbol, protocol, poolType) across all collections.
     * Applies optional filters and sorts the final result.
     */
    async getAllPools(filter: PoolFilterDto): Promise<PoolSummary[]> {
        const results: PoolSummary[] = [];
        const sources = this.selectSources(filter.protocol);

        for (const repo of sources) {
            const docs = await this.fetchLatestSnapshots(repo as MongoRepository<BaseProtocolSnapshot>, filter);
            results.push(...docs.map(doc => this.toSummary(doc)));
        }

        return this.applySortAndLimit(results, filter);
    }

    /**
     * Returns top-N pools sorted by the given field (default: totalApy desc).
     */
    async getTopPools(limit: number, sortBy: SortBy): Promise<PoolSummary[]> {
        return this.getAllPools({ limit, sortBy });
    }

    /**
     * Returns all historical snapshots within the date range, without deduplication.
     */
    async getPoolsHistory(filter: PoolFilterDto): Promise<PoolSummary[]> {
        const results: PoolSummary[] = [];
        const sources = this.selectSources(filter.protocol);

        for (const repo of sources) {
            const docs = await this.fetchHistorySnapshots(repo as MongoRepository<BaseProtocolSnapshot>, filter);
            results.push(...docs.map(doc => this.toSummary(doc)));
        }

        // Sort chronologically asc for history
        return results.sort((a, b) => a.dataTimestamp.getTime() - b.dataTimestamp.getTime());
    }

    // ─── Private Helpers ───────────────────────────────────────────────────────

    private selectSources(protocol?: string): MongoRepository<any>[] {
        const all = [this.bifrostRepo, this.moonwellRepo, this.hydrationRepo];
        if (!protocol) return all;

        const map: Record<string, MongoRepository<any>> = {
            bifrost: this.bifrostRepo,
            moonwell: this.moonwellRepo,
            hydration: this.hydrationRepo,
        };
        return map[protocol] ? [map[protocol]] : all;
    }

    private async fetchLatestSnapshots(
        repo: MongoRepository<BaseProtocolSnapshot>,
        filter: PoolFilterDto,
    ): Promise<BaseProtocolSnapshot[]> {
        const where: Record<string, any> = {};

        if (filter.asset) where['assetSymbol'] = filter.asset.toUpperCase();
        if (filter.poolType) where['poolType'] = filter.poolType;
        if (filter.network) where['network'] = filter.network;
        if (filter.minApy != null) where['totalApy'] = { $gte: filter.minApy };

        const docs = await repo.find({
            where,
            order: { dataTimestamp: 'DESC' } as any,
            take: 1500, // fetch enough to deduplicate latest-per-asset below
        });

        // Deduplicate: keep only the latest snapshot per (protocol, poolType, assetSymbol)
        const seen = new Map<string, BaseProtocolSnapshot>();
        for (const doc of docs) {
            const key = `${doc.protocol}:${doc.poolType}:${doc.assetSymbol}`;
            if (!seen.has(key)) seen.set(key, doc);
        }

        return [...seen.values()];
    }

    private async fetchHistorySnapshots(
        repo: MongoRepository<BaseProtocolSnapshot>,
        filter: PoolFilterDto,
    ): Promise<BaseProtocolSnapshot[]> {
        const where: Record<string, any> = {};

        if (filter.asset) where['assetSymbol'] = filter.asset.toUpperCase();
        if (filter.poolType) where['poolType'] = filter.poolType;
        if (filter.network) where['network'] = filter.network;
        if (filter.minApy != null) where['totalApy'] = { $gte: filter.minApy };

        // Date range filter on dataTimestamp
        if (filter.from || filter.to) {
            const dateFilter: Record<string, any> = {};
            if (filter.from) dateFilter['$gte'] = filter.from;
            if (filter.to) dateFilter['$lte'] = filter.to;
            where['dataTimestamp'] = dateFilter;
        }

        return repo.find({
            where,
            order: { dataTimestamp: 'ASC' } as any,
        });
    }

    /**
     * Convert a raw DB document into the normalized PoolSummary schema.
     * All protocol-specific metadata fields are surfaced at the top level.
     */
    private toSummary(doc: BaseProtocolSnapshot): PoolSummary {
        const m = (doc.metadata ?? {}) as Record<string, any>;

        return {
            // ── Identification ───────────────────────────────────────────────
            protocol: doc.protocol,
            network: doc.network,
            poolType: doc.poolType,
            assetSymbol: doc.assetSymbol,
            snapshotDate: doc.snapshotDate,

            // ── APY / APR ────────────────────────────────────────────────────
            supplyApy: doc.supplyApy,
            borrowApy: doc.borrowApy,
            rewardApy: doc.rewardApy,
            totalApy: doc.totalApy,

            // ── Market Size ──────────────────────────────────────────────────
            tvlUsd: doc.tvlUsd,
            utilizationRate: doc.utilizationRate,
            volume24hUsd: m['volume24hUsd'] as number | undefined,
            priceUsd: m['priceUsd'] as number | undefined,

            // ── Bifrost rolling windows (from metadata) ──────────────────────
            weekApy: m['weekApy'] as number | undefined,
            monthApy: m['monthApy'] as number | undefined,
            quarterApy: m['quarterApy'] as number | undefined,

            // ── Moonwell market info (from metadata) ─────────────────────────
            marketAddress: m['marketAddress'] as string | undefined,
            chainId: m['chainId'] as number | undefined,
            collateralFactor: m['collateralFactor'] as number | undefined,
            reserveFactor: m['reserveFactor'] as string | number | undefined,

            // ── Hydration pool info (from metadata) ──────────────────────────
            poolCategory: m['poolCategory'] as string | undefined,
            assetName: m['assetName'] as string | undefined,
            feeAndFarmApr: m['feeAndFarmApr'] as number | undefined,

            // ── Time tracking ────────────────────────────────────────────────
            dataTimestamp: doc.dataTimestamp,
            updatedAt: doc.updatedAt,
        };
    }

    private applySortAndLimit(pools: PoolSummary[], filter: PoolFilterDto): PoolSummary[] {
        const sortField = filter.sortBy ?? SortBy.TOTAL_APY;

        const sorted = [...pools].sort((a, b) => {
            const aVal = (a as any)[sortField] ?? -Infinity;
            const bVal = (b as any)[sortField] ?? -Infinity;
            return bVal - aVal; // always desc
        });

        return sorted.slice(0, filter.limit ?? 50);
    }
}
