import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BifrostService } from '../bifrost/bifrost.service';
import { MoonwellService } from '../moonwell/moonwell.service';
import { HydrationService } from '../hydration/hydration.service';

/**
 * SnapshotSchedulerService — Orchestrates periodic crawl of all protocol modules.
 *
 * Schedule: Every 10 minutes.
 * Upsert strategy: Each service stamps snapshotDate = today's UTC date ("YYYY-MM-DD")
 *                  before persisting, so the MongoDB upsert key is:
 *                  (network, poolType, assetSymbol, snapshotDate)
 *                  → One document per asset per UTC day, overwritten in-place each run.
 *                  After 00:00 UTC, snapshotDate advances → a fresh document is created.
 */
@Injectable()
export class SnapshotSchedulerService {
    private readonly logger = new Logger(SnapshotSchedulerService.name);

    constructor(
        private readonly bifrostService: BifrostService,
        private readonly moonwellService: MoonwellService,
        private readonly hydrationService: HydrationService,
    ) { }

    /** Runs every 10 minutes: 0, 10, 20, 30, 40, 50 past the hour. */
    @Cron('0 */10 * * * *')
    async runScheduledCrawl(): Promise<void> {
        const now = new Date().toISOString();
        this.logger.log(`🕐 [Scheduler] Crawl triggered at ${now}`);

        const results = await Promise.allSettled([
            this.bifrostService.crawlAll(),
            this.moonwellService.crawlMarkets(),
            this.hydrationService.crawlPools(),
        ]);

        for (const [idx, result] of results.entries()) {
            const label = ['Bifrost', 'Moonwell', 'Hydration'][idx];
            if (result.status === 'fulfilled') {
                this.logger.log(`✅ [Scheduler] ${label} crawl succeeded`);
            } else {
                this.logger.error(`❌ [Scheduler] ${label} crawl failed: ${result.reason}`);
            }
        }

        this.logger.log(`🏁 [Scheduler] All crawls finished at ${new Date().toISOString()}`);
    }
}
