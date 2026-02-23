import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { MoonwellMarketsCrawler } from './crawlers/markets.crawler';
import { CrawlResult } from '../../shared/crawlers/base-api.crawler';
import { MoonwellSnapshot, Protocol, PoolType } from '../../shared/entities/protocol-snapshot.entity';
import { ActivityLogService } from '../../shared/services/activity-log.service';
import { getUtcDateKey } from '../../shared/utils/date.util';

@Injectable()
export class MoonwellService {
    private readonly logger = new Logger(MoonwellService.name);

    constructor(
        @InjectRepository(MoonwellSnapshot)
        private readonly repository: MongoRepository<MoonwellSnapshot>,
        private readonly marketsCrawler: MoonwellMarketsCrawler,
        private readonly activityLog: ActivityLogService,
    ) { }

    async crawlMarkets(): Promise<CrawlResult<MoonwellSnapshot>> {
        this.logger.log('🔄 Starting Moonwell markets crawl...');
        const result = (await this.marketsCrawler.crawl()) as CrawlResult<MoonwellSnapshot>;

        if (result.data && result.data.length > 0) {
            await this.upsertSnapshots(result.data);
            this.logger.log(`💾 Persisted ${result.data.length} Moonwell market snapshots`);
        }

        await this.activityLog.recordSuccess({
            protocol: Protocol.MOONWELL,
            network: result.network,
            poolType: PoolType.LENDING,
            itemsFound: result.itemsFound,
            durationMs: result.duration,
        });

        return result;
    }

    private async upsertSnapshots(snapshots: MoonwellSnapshot[]): Promise<void> {
        const dateKey = getUtcDateKey();
        const now = new Date();
        for (const snapshot of snapshots) {
            snapshot.snapshotDate = dateKey;
            snapshot.updatedAt = now;
            await this.repository.findOneAndUpdate(
                {
                    network: snapshot.network,
                    poolType: snapshot.poolType,
                    assetSymbol: snapshot.assetSymbol,
                    snapshotDate: dateKey,
                },
                { $set: snapshot },
                { upsert: true }
            );
        }
    }
}
