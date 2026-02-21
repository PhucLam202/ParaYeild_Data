import { Module } from '@nestjs/common';
import { MoonwellService } from './moonwell.service';
import { MoonwellController } from './moonwell.controller';
import { MoonwellMarketsCrawler } from './crawlers/markets.crawler';

/**
 * MoonwellModule — Moonwell lending protocol indexer.
 *
 * Covers: Moonbeam (chainId 1284) + Base (chainId 8453).
 *
 * PoolConfigService and FileLoggerUtil are provided globally by SharedModule.
 * All markets are fetched in a single Ponder API call and fan out across chains.
 */
@Module({
    controllers: [MoonwellController],
    providers: [
        MoonwellMarketsCrawler,
        MoonwellService,
    ],
    exports: [MoonwellService],
})
export class MoonwellModule { }
