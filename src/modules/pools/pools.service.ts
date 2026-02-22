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

export interface PoolSummary {
    protocol: string;
    network: string;
    poolType: string;
    assetSymbol: string;
    supplyApy?: number;
    borrowApy?: number;
    rewardApy?: number;
    totalApy?: number;
    tvlUsd?: number;
    utilizationRate?: number;
    metadata: Record<string, unknown>;
    dataTimestamp: Date;
    crawledAt: Date;
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

        // Collect from all repos unless filtered to a specific protocol
        const sources = this.selectSources(filter.protocol);

        for (const repo of sources) {
            const docs = await this.fetchLatestSnapshots(repo as MongoRepository<BaseProtocolSnapshot>, filter);
            results.push(...docs.map(doc => this.toSummary(doc, filter.from, filter.to)));
        }

        return this.applySortAndLimit(results, filter);
    }

    /**
     * Returns top-N pools sorted by the given field (default: totalApy desc).
     */
    async getTopPools(limit: number, sortBy: SortBy): Promise<PoolSummary[]> {
        return this.getAllPools({ limit, sortBy });
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
            take: 1000, // fetch enough to deduplicate latest-per-asset below
        });

        // Deduplicate: keep only the latest snapshot per (protocol, poolType, assetSymbol)
        const seen = new Map<string, BaseProtocolSnapshot>();
        for (const doc of docs) {
            const key = `${doc.protocol}:${doc.poolType}:${doc.assetSymbol}`;
            if (!seen.has(key)) seen.set(key, doc);
        }

        return [...seen.values()];
    }

    private toSummary(doc: BaseProtocolSnapshot, from?: Date, to?: Date): PoolSummary {
        // Deep clone metadata to avoid modifying the entity directly
        const metadata = JSON.parse(JSON.stringify(doc.metadata || {}));

        // Filter history array by date range if it exists
        if (Array.isArray(metadata.history) && metadata.history.length > 0) {
            const defaultFrom = new Date();
            defaultFrom.setDate(defaultFrom.getDate() - 7);

            const fromTime = from ? from.getTime() : defaultFrom.getTime();
            const toTime = to ? to.getTime() : new Date().getTime();

            metadata.history = metadata.history.filter((entry: any) => {
                // Assuming entry.date is a UNIX timestamp in seconds
                const entryTime = entry.date * 1000;
                return entryTime >= fromTime && entryTime <= toTime;
            });
        }

        return {
            protocol: doc.protocol,
            network: doc.network,
            poolType: doc.poolType,
            assetSymbol: doc.assetSymbol,
            supplyApy: doc.supplyApy,
            borrowApy: doc.borrowApy,
            rewardApy: doc.rewardApy,
            totalApy: doc.totalApy,
            tvlUsd: doc.tvlUsd,
            utilizationRate: doc.utilizationRate,
            metadata,
            dataTimestamp: doc.dataTimestamp,
            crawledAt: doc.crawledAt,
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
