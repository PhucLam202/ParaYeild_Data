import { Module } from '@nestjs/common';
import { BifrostService } from './bifrost.service';
import { BifrostController } from './bifrost.controller';
import { VStakingCrawler } from './crawlers/vstaking.crawler';
import { FarmingCrawler } from './crawlers/farming.crawler';

/**
 * BifrostModule — Bifrost parachain data indexer.
 *
 * PoolConfigService and FileLoggerUtil are provided globally by SharedModule.
 * Register SharedModule once in AppModule.
 */
@Module({
    controllers: [BifrostController],
    providers: [
        VStakingCrawler,
        FarmingCrawler,
        BifrostService,
    ],
    exports: [BifrostService],
})
export class BifrostModule { }
