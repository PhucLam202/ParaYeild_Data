import { Entity, ObjectIdColumn, Column, CreateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

/**
 * CrawlLog — activity record written once per crawl run.
 *
 * Stored in the `crawl_logs` MongoDB collection.
 * Replaces the per-module JSON log files that were previously written to disk.
 *
 * One document is created per crawl invocation regardless of how many pool
 * snapshots were found, giving a lightweight audit trail of crawl history.
 */
@Entity('crawl_logs')
export class CrawlLog {
    @ObjectIdColumn()
    _id?: ObjectId;

    /** Protocol name, e.g. 'bifrost', 'moonwell', 'hydration' */
    @Column()
    protocol: string;

    /** Network / chain crawled, e.g. 'polkadot', 'moonbeam' */
    @Column()
    network: string;

    /** Pool type crawled, e.g. 'vstaking', 'farming', 'lending', 'dex' */
    @Column()
    poolType: string;

    /** Number of snapshots found in this run */
    @Column()
    itemsFound: number;

    /** Duration of the crawl in milliseconds */
    @Column()
    durationMs: number;

    /** Whether the crawl succeeded */
    @Column()
    success: boolean;

    /** Error message if the crawl failed */
    @Column({ nullable: true })
    errorMessage?: string;

    /** ISO timestamp when the crawl was triggered */
    @Column()
    crawledAt: Date;

    /** Automatically set by TypeORM on insert */
    @CreateDateColumn()
    createdAt: Date;
}
