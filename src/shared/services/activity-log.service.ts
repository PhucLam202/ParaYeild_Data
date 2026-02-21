import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { CrawlLog } from '../entities/crawl-log.entity';

export interface CrawlActivity {
    protocol: string;
    network: string;
    poolType: string;
    itemsFound: number;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
}

/**
 * ActivityLogService
 *
 * Replaces the old FileLoggerUtil that wrote per-crawl JSON files to disk.
 *
 * For every crawl run, it:
 *   1. Inserts one `CrawlLog` document into the `crawl_logs` MongoDB collection
 *   2. Appends a single human-readable line to `logs/server.log`
 *
 * The per-module JSON log directories (logs/bifrost/, logs/moonwell/,
 * logs/hydration/) are no longer used — data lives in MongoDB snapshots.
 */
@Injectable()
export class ActivityLogService {
    private readonly logger = new Logger(ActivityLogService.name);
    private readonly serverLogPath = path.join(process.cwd(), 'logs', 'server.log');

    constructor(
        @InjectRepository(CrawlLog)
        private readonly crawlLogRepo: MongoRepository<CrawlLog>,
    ) {
        // Ensure the logs directory exists
        fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
    }

    /**
     * Record a crawl activity event.
     * Called once per crawl run by each protocol service.
     */
    async record(activity: CrawlActivity): Promise<void> {
        const crawledAt = new Date();

        // ── 1. Persist to MongoDB ─────────────────────────────────────────────
        try {
            const log = this.crawlLogRepo.create({
                ...activity,
                crawledAt,
            });
            await this.crawlLogRepo.save(log);
        } catch (err) {
            this.logger.warn(`⚠️ Failed to save CrawlLog to DB: ${err}`);
        }

        // ── 2. Append one line to logs/server.log ─────────────────────────────
        const status = activity.success ? '✅' : '❌';
        const line = [
            `[${crawledAt.toISOString()}]`,
            status,
            `${activity.protocol}/${activity.network}/${activity.poolType}`,
            `items=${activity.itemsFound}`,
            `duration=${activity.durationMs}ms`,
            activity.errorMessage ? `error="${activity.errorMessage}"` : null,
        ]
            .filter(Boolean)
            .join('  ') + '\n';

        try {
            fs.appendFileSync(this.serverLogPath, line, 'utf-8');
        } catch (err) {
            this.logger.warn(`⚠️ Failed to write to server.log: ${err}`);
        }

        this.logger.log(
            `📋 Logged: ${activity.protocol}/${activity.network}/${activity.poolType} — ${activity.itemsFound} items in ${activity.durationMs}ms`,
        );
    }

    /**
     * Convenience wrapper for a successful crawl result.
     */
    async recordSuccess(params: Omit<CrawlActivity, 'success'>): Promise<void> {
        return this.record({ ...params, success: true });
    }

    /**
     * Convenience wrapper for a failed crawl.
     */
    async recordFailure(
        params: Omit<CrawlActivity, 'success' | 'itemsFound'>,
        error: unknown,
    ): Promise<void> {
        return this.record({
            ...params,
            itemsFound: 0,
            success: false,
            errorMessage: error instanceof Error ? error.message : String(error),
        });
    }
}
