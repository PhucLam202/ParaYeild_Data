import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { HydrationOmnipoolCrawler } from './crawlers/omnipool.crawler';
import { HydrationSnapshot, Protocol, PoolType } from '../../shared/entities/protocol-snapshot.entity';
import { ActivityLogService } from '../../shared/services/activity-log.service';

export interface HydrationCrawlResult {
    protocol: string;
    network: string;
    poolType: string;
    timestamp: string;
    duration: number;
    itemsFound: number;
    data: HydrationSnapshot[];
}

@Injectable()
export class HydrationService {
    private readonly logger = new Logger(HydrationService.name);

    constructor(
        @InjectRepository(HydrationSnapshot)
        private readonly repository: MongoRepository<HydrationSnapshot>,
        private readonly omnipoolCrawler: HydrationOmnipoolCrawler,
        private readonly activityLog: ActivityLogService,
    ) { }

    async crawlPools(): Promise<HydrationCrawlResult> {
        this.logger.log('🔄 Starting Hydration omnipool + stablepools crawl...');
        const result = await this.omnipoolCrawler.crawl();

        if (result.data && result.data.length > 0) {
            await this.upsertSnapshots(result.data as HydrationSnapshot[]);
            this.logger.log(`💾 Persisted ${result.data.length} Hydration pool snapshots`);
        }

        await this.activityLog.recordSuccess({
            protocol: Protocol.HYDRATION,
            network: result.network,
            poolType: PoolType.DEX,
            itemsFound: result.itemsFound,
            durationMs: result.duration,
        });

        return {
            ...result,
            data: result.data as HydrationSnapshot[],
        };
    }

    private async upsertSnapshots(snapshots: HydrationSnapshot[]): Promise<void> {
        for (const snapshot of snapshots) {
            await this.repository.findOneAndUpdate(
                {
                    network: snapshot.network,
                    poolType: snapshot.poolType,
                    assetSymbol: snapshot.assetSymbol,
                    dataTimestamp: snapshot.dataTimestamp,
                },
                { $set: snapshot },
                { upsert: true },
            );
        }
    }
}
