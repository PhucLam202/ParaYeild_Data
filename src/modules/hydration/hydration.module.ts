import { Module } from '@nestjs/common';
import { HydrationService } from './hydration.service';
import { HydrationController } from './hydration.controller';
import { HydrationOmnipoolCrawler } from './crawlers/omnipool.crawler';

/**
 * HydrationModule — Hydration DEX liquidity indexer.
 *
 * Crawls https://app.hydration.net/liquidity/omnipool-stablepools via Playwright.
 * Covers: Omnipool + Stablepools across all paginated pages.
 *
 * TypeORM repository (HydrationSnapshot) is registered in AppModule
 * via TypeOrmModule.forFeature([HydrationSnapshot]).
 *
 * PoolConfigService and FileLoggerUtil are provided globally by SharedModule.
 */
@Module({
    controllers: [HydrationController],
    providers: [
        HydrationOmnipoolCrawler,
        HydrationService,
    ],
    exports: [HydrationService],
})
export class HydrationModule { }
