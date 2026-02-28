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
export interface PoolSummary {
    protocol: string;
    network: string;
    poolType: string;
    assetSymbol: string;
    snapshotDate?: string;
    supplyApy?: number;
    borrowApy?: number;
    rewardApy?: number;
    totalApy?: number;
    tvlUsd?: number;
    utilizationRate?: number;
    volume24hUsd?: number;
    priceUsd?: number;
    weekApy?: number;
    monthApy?: number;
    quarterApy?: number;
    marketAddress?: string;
    chainId?: number;
    collateralFactor?: number;
    reserveFactor?: string | number;
    poolCategory?: string;
    assetName?: string;
    feeAndFarmApr?: number;
    dataTimestamp: Date;
    updatedAt?: Date;
}

// ─── Meta Response Shapes (for simulation/backtest engine) ────────────────────
export interface ParachainMeta {
    id: string;        // "polkadot"
    name: string;      // "Polkadot"
    protocols: string[];
}

export interface ProtocolTypeMeta {
    id: string;        // "vstaking"
    label: string;     // "Liquid Staking"
    category: string;  // "staking" | "defi" | "lending"
    protocols: string[];
}

export interface TokenMeta {
    symbol: string;
    protocols: string[];
    networks: string[];
    poolTypes: string[];
}

// ─── Dynamic name formatter ────────────────────────────────────────────────────
// "moonbeam" → "Moonbeam", "polkadot" → "Polkadot", "my-new-chain" → "My New Chain"
// No hardcoded map — adding a new parachain to pools.yaml is enough.
function toDisplayName(id: string): string {
    return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Pool type labels: human-readable label + category for known types.
// Unknown pool types auto-get a capitalized display name via toDisplayName().
const POOL_TYPE_META: Record<string, { label: string; category: string }> = {
    vstaking: { label: 'Liquid Staking', category: 'staking' },
    farming: { label: 'Yield Farming', category: 'defi' },
    lending: { label: 'Lending / Money Market', category: 'lending' },
    dex: { label: 'DEX / AMM', category: 'defi' },
    staking: { label: 'Native Staking', category: 'staking' },
};

@Injectable()
export class PoolsService {
    private readonly logger = new Logger(PoolsService.name);

    // ─── Simple in-memory TTL cache (avoids hitting DB on every meta request) ──
    private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    constructor(
        @InjectRepository(BifrostSnapshot)
        private readonly bifrostRepo: MongoRepository<BifrostSnapshot>,
        @InjectRepository(MoonwellSnapshot)
        private readonly moonwellRepo: MongoRepository<MoonwellSnapshot>,
        @InjectRepository(HydrationSnapshot)
        private readonly hydrationRepo: MongoRepository<HydrationSnapshot>,
    ) { }

    // ─── Pool List Endpoints ──────────────────────────────────────────────────

    async getAllPools(filter: PoolFilterDto): Promise<PoolSummary[]> {
        const results: PoolSummary[] = [];
        const sources = this.selectSources(filter.protocol);

        for (const repo of sources) {
            const docs = await this.fetchLatestSnapshots(repo as MongoRepository<BaseProtocolSnapshot>, filter);
            results.push(...docs.map(doc => this.toSummary(doc)));
        }

        return this.applySortAndLimit(results, filter);
    }

    async getTopPools(limit: number, sortBy: SortBy): Promise<PoolSummary[]> {
        return this.getAllPools({ limit, sortBy });
    }

    async getPoolsHistory(filter: PoolFilterDto): Promise<PoolSummary[]> {
        const results: PoolSummary[] = [];
        const sources = this.selectSources(filter.protocol);

        for (const repo of sources) {
            const docs = await this.fetchHistorySnapshots(repo as MongoRepository<BaseProtocolSnapshot>, filter);
            results.push(...docs.map(doc => this.toSummary(doc)));
        }

        return results.sort((a, b) => a.dataTimestamp.getTime() - b.dataTimestamp.getTime());
    }

    // ─── Meta / Simulation Endpoints ─────────────────────────────────────────

    /**
     * Returns all distinct networks (parachains) that have data,
     * along with which protocols are available on each.
     */
    async getDistinctParachains(): Promise<ParachainMeta[]> {
        const cached = this.getCached<ParachainMeta[]>('parachains');
        if (cached) return cached;

        const rows = await this.distinctGroupAcrossAll(['network', 'protocol']);

        const networkMap = new Map<string, Set<string>>();
        for (const row of rows) {
            if (!networkMap.has(row.network)) networkMap.set(row.network, new Set());
            networkMap.get(row.network)!.add(row.protocol);
        }

        const data: ParachainMeta[] = [...networkMap.entries()]
            .map(([id, protocols]) => ({
                id,
                name: toDisplayName(id),
                protocols: [...protocols].sort(),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        this.setCached('parachains', data);
        return data;
    }

    /**
     * Returns all distinct pool types with human-readable labels,
     * along with which protocols support each type.
     */
    async getDistinctProtocolTypes(): Promise<ProtocolTypeMeta[]> {
        const cached = this.getCached<ProtocolTypeMeta[]>('protocol-types');
        if (cached) return cached;

        const rows = await this.distinctGroupAcrossAll(['poolType', 'protocol']);

        const typeMap = new Map<string, Set<string>>();
        for (const row of rows) {
            if (!typeMap.has(row.poolType)) typeMap.set(row.poolType, new Set());
            typeMap.get(row.poolType)!.add(row.protocol);
        }

        const data: ProtocolTypeMeta[] = [...typeMap.entries()]
            .map(([id, protocols]) => {
                const meta = POOL_TYPE_META[id] ?? { label: toDisplayName(id), category: 'other' };
                return { id, label: meta.label, category: meta.category, protocols: [...protocols].sort() };
            })
            .sort((a, b) => a.label.localeCompare(b.label));

        this.setCached('protocol-types', data);
        return data;
    }

    /**
     * Returns all distinct tokens/assets with which protocols, networks,
     * and pool types they appear in. Used for token-pair selection in simulation.
     */
    async getDistinctTokens(): Promise<TokenMeta[]> {
        const cached = this.getCached<TokenMeta[]>('tokens');
        if (cached) return cached;

        const rows = await this.distinctGroupAcrossAll(['assetSymbol', 'protocol', 'network', 'poolType']);

        const tokenMap = new Map<string, { protocols: Set<string>; networks: Set<string>; poolTypes: Set<string> }>();
        for (const row of rows) {
            const sym = row.assetSymbol as string;
            if (!tokenMap.has(sym)) tokenMap.set(sym, { protocols: new Set(), networks: new Set(), poolTypes: new Set() });
            const entry = tokenMap.get(sym)!;
            entry.protocols.add(row.protocol as string);
            entry.networks.add(row.network as string);
            entry.poolTypes.add(row.poolType as string);
        }

        const data: TokenMeta[] = [...tokenMap.entries()]
            .map(([symbol, { protocols, networks, poolTypes }]) => ({
                symbol,
                protocols: [...protocols].sort(),
                networks: [...networks].sort(),
                poolTypes: [...poolTypes].sort(),
            }))
            .sort((a, b) => a.symbol.localeCompare(b.symbol));

        this.setCached('tokens', data);
        return data;
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

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

    /**
     * Uses MongoDB aggregation pipeline to return the latest snapshot per
     * (protocol, poolType, assetSymbol) key — much faster than JS dedup.
     */
    private async fetchLatestSnapshots(
        repo: MongoRepository<BaseProtocolSnapshot>,
        filter: PoolFilterDto,
    ): Promise<BaseProtocolSnapshot[]> {
        const matchStage = this.buildMatchStage(filter);

        const pipeline: object[] = [
            ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
            { $sort: { dataTimestamp: -1 } },
            {
                $group: {
                    _id: { protocol: '$protocol', poolType: '$poolType', assetSymbol: '$assetSymbol' },
                    doc: { $first: '$$ROOT' },
                },
            },
            { $replaceRoot: { newRoot: '$doc' } },
        ];

        const cursor = repo.aggregate(pipeline);
        return cursor.toArray() as Promise<BaseProtocolSnapshot[]>;
    }

    private async fetchHistorySnapshots(
        repo: MongoRepository<BaseProtocolSnapshot>,
        filter: PoolFilterDto,
    ): Promise<BaseProtocolSnapshot[]> {
        const where = this.buildMatchStage(filter);

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

    private buildMatchStage(filter: PoolFilterDto): Record<string, any> {
        const match: Record<string, any> = {};
        if (filter.asset) match['assetSymbol'] = filter.asset.toUpperCase();
        if (filter.poolType) match['poolType'] = filter.poolType;
        if (filter.network) match['network'] = filter.network;
        if (filter.minApy != null) match['totalApy'] = { $gte: filter.minApy };
        return match;
    }

    /**
     * Aggregates distinct field combinations across all 3 protocol collections.
     * E.g. fields = ['network', 'protocol'] → distinct (network, protocol) pairs.
     */
    private async distinctGroupAcrossAll(fields: string[]): Promise<Record<string, string>[]> {
        const groupId = fields.reduce<Record<string, string>>((acc, f) => {
            acc[f] = `$${f}`;
            return acc;
        }, {});
        const projectFields = fields.reduce<Record<string, string>>((acc, f) => {
            acc[f] = `$_id.${f}`;
            return acc;
        }, { _id: '0' });

        const pipeline = [
            { $group: { _id: groupId } },
            { $project: { _id: 0, ...projectFields } },
        ];

        const [bifrost, moonwell, hydration] = await Promise.all([
            (this.bifrostRepo.aggregate(pipeline) as any).toArray(),
            (this.moonwellRepo.aggregate(pipeline) as any).toArray(),
            (this.hydrationRepo.aggregate(pipeline) as any).toArray(),
        ]);

        return [...bifrost, ...moonwell, ...hydration];
    }

    private toSummary(doc: BaseProtocolSnapshot): PoolSummary {
        const m = (doc.metadata ?? {}) as Record<string, any>;

        return {
            protocol: doc.protocol,
            network: doc.network,
            poolType: doc.poolType,
            assetSymbol: doc.assetSymbol,
            snapshotDate: doc.snapshotDate,
            supplyApy: doc.supplyApy,
            borrowApy: doc.borrowApy,
            rewardApy: doc.rewardApy,
            totalApy: doc.totalApy,
            tvlUsd: doc.tvlUsd,
            utilizationRate: doc.utilizationRate,
            volume24hUsd: m['volume24hUsd'] as number | undefined,
            priceUsd: m['priceUsd'] as number | undefined,
            weekApy: m['weekApy'] as number | undefined,
            monthApy: m['monthApy'] as number | undefined,
            quarterApy: m['quarterApy'] as number | undefined,
            marketAddress: m['marketAddress'] as string | undefined,
            chainId: m['chainId'] as number | undefined,
            collateralFactor: m['collateralFactor'] as number | undefined,
            reserveFactor: m['reserveFactor'] as string | number | undefined,
            poolCategory: m['poolCategory'] as string | undefined,
            assetName: m['assetName'] as string | undefined,
            feeAndFarmApr: m['feeAndFarmApr'] as number | undefined,
            dataTimestamp: doc.dataTimestamp,
            updatedAt: doc.updatedAt,
        };
    }

    private applySortAndLimit(pools: PoolSummary[], filter: PoolFilterDto): PoolSummary[] {
        const sortField = filter.sortBy ?? SortBy.TOTAL_APY;
        const sorted = [...pools].sort((a, b) => {
            const aVal = (a as any)[sortField] ?? -Infinity;
            const bVal = (b as any)[sortField] ?? -Infinity;
            return bVal - aVal;
        });
        return sorted.slice(0, filter.limit ?? 50);
    }

    // ─── Cache Helpers ────────────────────────────────────────────────────────

    private getCached<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (entry && Date.now() < entry.expiresAt) return entry.data as T;
        return null;
    }

    private setCached(key: string, data: unknown): void {
        this.cache.set(key, { data, expiresAt: Date.now() + this.CACHE_TTL_MS });
    }
}
