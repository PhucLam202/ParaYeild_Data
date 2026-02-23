/**
 * ProtocolSnapshot — Unified entity for ALL protocol crawlers.
 *
 * Every module (Bifrost, Moonwell, ArthSwap, StellaSwap, Lido…) stores data
 * using this same shape. Only the MongoDB *database name* differs.
 *
 * Common financial fields let analysts query across all protocols.
 * Protocol-specific data lives in `metadata` without polluting the schema.
 *
 * TypeORM decorators are commented out — uncomment when Phase 2 (DB persistence) begins.
 * Required packages: @nestjs/typeorm typeorm mongodb
 */

import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';

// ─── Pool Type Registry ──────────────────────────────────────────────────────
export enum PoolType {
    VSTAKING = 'vstaking',
    FARMING = 'farming',
    LENDING = 'lending',
    DEX = 'dex',
    STAKING = 'staking',
}

export enum Protocol {
    BIFROST = 'bifrost',
    MOONWELL = 'moonwell',
    ACALA = 'acala',
    HYDRATION = 'hydration',
    ARTHSWAP = 'arthswap',
    STELLASWAP = 'stellaswap',
    LIDO = 'lido',
}

export enum Network {
    POLKADOT = 'polkadot',
    KUSAMA = 'kusama',
    MOONBEAM = 'moonbeam',
    BASE = 'base',
    ETHEREUM = 'ethereum',
    ASTAR = 'astar',
}

// ─── Base Snapshot Definition ─────────────────────────────────────────────────
/**
 * Unique key per day: (network, poolType, assetSymbol, snapshotDate)
 * One document per asset per UTC day. The cron job upserts ($set) into this
 * document every 10 minutes, updating APY to the latest value within that day.
 * After 00:00 UTC, snapshotDate increments → a fresh document is created.
 */
@Index(['network', 'poolType', 'assetSymbol', 'snapshotDate'], { unique: true })
export abstract class BaseProtocolSnapshot {
    @ObjectIdColumn()
    _id?: ObjectId;

    @Column()
    protocol: Protocol | string;

    @Column()
    network: Network | string;

    @Column()
    poolType: PoolType | string;

    @Column()
    assetSymbol: string;

    /**
     * UTC date key "YYYY-MM-DD" — defines the daily upsert bucket.
     * Set by the service layer before persisting; never comes from the crawler.
     */
    @Column({ nullable: true })
    snapshotDate?: string;

    @Column({ nullable: true })
    supplyApy?: number;

    @Column({ nullable: true })
    borrowApy?: number;

    @Column({ nullable: true })
    rewardApy?: number;

    @Column({ nullable: true })
    totalApy?: number;

    @Column({ nullable: true })
    tvlUsd?: number;

    @Column({ nullable: true })
    utilizationRate?: number;

    @Column('simple-json')
    metadata: Record<string, unknown>;

    /** Timestamp of the actual data point from the external API (may be hourly). */
    @Column()
    dataTimestamp: Date;

    /** Timestamp when the document was first created (start of the UTC day). */
    @CreateDateColumn()
    crawledAt: Date;

    /** Timestamp when the cron job last updated this document within the same UTC day. */
    @UpdateDateColumn({ nullable: true })
    updatedAt?: Date;
}



// ─── Protocol-Specific Collections ───────────────────────────────────────────

@Entity('bifrost_snapshots')
export class BifrostSnapshot extends BaseProtocolSnapshot { }

@Entity('moonwell_snapshots')
export class MoonwellSnapshot extends BaseProtocolSnapshot { }

@Entity('hydration_snapshots')
export class HydrationSnapshot extends BaseProtocolSnapshot { }

// Re-export ProtocolSnapshot as a type for compatibility if needed, 
// though we should use specific ones now.
export type ProtocolSnapshot = BaseProtocolSnapshot;

// ─── Unique/Dedup Key ─────────────────────────────────────────────────────────
// When Phase 2 adds DB, create this compound unique index per database:
//   { protocol, network, poolType, assetSymbol, dataTimestamp } — unique (dedup)
//   { poolType, assetSymbol, crawledAt: -1 }                    — time-series
//   { protocol, network }                                        — filter
