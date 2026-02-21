import { Controller, Get, Logger } from '@nestjs/common';
import { HydrationService } from './hydration.service';

@Controller('hydration')
export class HydrationController {
    private readonly logger = new Logger(HydrationController.name);

    constructor(private readonly hydrationService: HydrationService) { }

    /**
     * GET /hydration/crawl/pools
     *
     * Triggers a full Playwright crawl of Hydration omnipool + stablepools.
     * Paginates through all pages and returns Pool Asset, Price, 24H Volume,
     * TVL, and Fee+Farm APR for every pool.
     */
    @Get('crawl/pools')
    async crawlPools() {
        this.logger.log('📥 Manual trigger: Hydration pools crawl');
        const result = await this.hydrationService.crawlPools();

        return {
            success: true,
            message: 'Hydration pools crawled successfully',
            protocol: result.protocol,
            network: result.network,
            poolType: result.poolType,
            duration: `${result.duration}ms`,
            itemsFound: result.itemsFound,
            timestamp: result.timestamp,
            data: result.data,
        };
    }
}
