import { Controller, Get, Logger } from '@nestjs/common';
import { BifrostService } from './bifrost.service';

@Controller('bifrost')
export class BifrostController {
    private readonly logger = new Logger(BifrostController.name);

    constructor(private readonly bifrostService: BifrostService) { }

    @Get('crawl/vstaking')
    async crawlVStaking() {
        this.logger.log('📥 Manual trigger: vStaking crawl');
        const result = await this.bifrostService.crawlVStaking();
        return {
            success: true,
            message: 'vStaking data crawled successfully',
            duration: `${result.duration}ms`,
            itemsFound: result.itemsFound,
            data: result.data,
        };
    }

    @Get('crawl/farming')
    async crawlFarming() {
        this.logger.log('📥 Manual trigger: Farming crawl');
        const result = await this.bifrostService.crawlFarming();
        return {
            success: true,
            message: 'Farming data crawled successfully',
            duration: `${result.duration}ms`,
            itemsFound: result.itemsFound,
            data: result.data,
        };
    }

    @Get('crawl/all')
    async crawlAll() {
        this.logger.log('📥 Manual trigger: Full crawl (vStaking + Farming)');
        const result = await this.bifrostService.crawlAll();
        return {
            success: true,
            message: 'All data crawled successfully',
            vstaking: {
                duration: `${result.vstaking.duration}ms`,
                itemsFound: result.vstaking.itemsFound,
                data: result.vstaking.data,
            },
            farming: {
                duration: `${result.farming.duration}ms`,
                itemsFound: result.farming.itemsFound,
                data: result.farming.data,
            },
        };
    }
}
