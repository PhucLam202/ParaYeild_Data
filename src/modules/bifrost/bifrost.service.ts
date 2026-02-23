import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { VStakingCrawler } from './crawlers/vstaking.crawler';
import { FarmingCrawler } from './crawlers/farming.crawler';
import { CrawlResult } from '../../shared/crawlers/base-api.crawler';
import { BifrostSnapshot, Protocol, PoolType, ProtocolSnapshot } from '../../shared/entities/protocol-snapshot.entity';
import { ActivityLogService } from '../../shared/services/activity-log.service';
import { getUtcDateKey } from '../../shared/utils/date.util';

export interface CrawlAllResult {
    vstaking: CrawlResult<ProtocolSnapshot>;
    farming: CrawlResult<ProtocolSnapshot>;
}

@Injectable()
export class BifrostService {
    private readonly logger = new Logger(BifrostService.name);

    constructor(
        @InjectRepository(BifrostSnapshot)
        private readonly repository: MongoRepository<BifrostSnapshot>,
        private readonly vstakingCrawler: VStakingCrawler,
        private readonly farmingCrawler: FarmingCrawler,
        private readonly activityLog: ActivityLogService,
    ) { }

    async crawlVStaking(): Promise<CrawlResult<BifrostSnapshot>> {
        this.logger.log('🔄 Starting vStaking crawl...');
        const result = (await this.vstakingCrawler.crawl()) as CrawlResult<BifrostSnapshot>;

        if (result.data && result.data.length > 0) {
            await this.upsertSnapshots(result.data);
            this.logger.log(`💾 Persisted ${result.data.length} vStaking snapshots`);
        }

        await this.activityLog.recordSuccess({
            protocol: Protocol.BIFROST,
            network: result.network,
            poolType: PoolType.VSTAKING,
            itemsFound: result.itemsFound,
            durationMs: result.duration,
        });

        return result;
    }

    async crawlFarming(): Promise<CrawlResult<BifrostSnapshot>> {
        this.logger.log('🔄 Starting Farming crawl...');
        const result = (await this.farmingCrawler.crawl()) as CrawlResult<BifrostSnapshot>;

        if (result.data && result.data.length > 0) {
            await this.upsertSnapshots(result.data);
            this.logger.log(`💾 Persisted ${result.data.length} Farming snapshots`);
        }

        await this.activityLog.recordSuccess({
            protocol: Protocol.BIFROST,
            network: result.network,
            poolType: PoolType.FARMING,
            itemsFound: result.itemsFound,
            durationMs: result.duration,
        });

        return result;
    }

    private async upsertSnapshots(snapshots: BifrostSnapshot[]): Promise<void> {
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

    async crawlAll(): Promise<CrawlAllResult> {
        this.logger.log('🔄 Starting full crawl (vStaking + Farming) in parallel...');
        const [vstaking, farming] = await Promise.all([
            this.crawlVStaking(),
            this.crawlFarming(),
        ]);
        this.logger.log(`✅ Full crawl done — vStaking: ${vstaking.duration}ms, Farming: ${farming.duration}ms`);
        return { vstaking, farming };
    }
}
