import { Controller, Get, Logger } from '@nestjs/common';
import { MoonwellService } from './moonwell.service';

@Controller('moonwell')
export class MoonwellController {
    private readonly logger = new Logger(MoonwellController.name);

    constructor(private readonly moonwellService: MoonwellService) { }

    /**
     * GET /moonwell/crawl/markets
     *
     * Triggers a full crawl of all Moonwell lending markets across Moonbeam + Base.
     * Returns the crawl result with APY, TVL, borrow/supply stats per market.
     */
    @Get('crawl/markets')
    async crawlMarkets() {
        this.logger.log('📥 Manual trigger: Moonwell markets crawl');
        const result = await this.moonwellService.crawlMarkets();

        return {
            success: true,
            message: 'Moonwell markets crawled successfully',
            protocol: result.protocol,
            network: result.network,
            duration: `${result.duration}ms`,
            itemsFound: result.itemsFound,
            timestamp: result.timestamp,
            data: result.data,
        };
    }
}
