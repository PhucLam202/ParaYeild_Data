import { Controller, Get, Logger, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { PoolsService } from './pools.service';
import { PoolFilterDto, SortBy } from './dto/pool-filter.dto';

@Controller('pools')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PoolsController {
    private readonly logger = new Logger(PoolsController.name);

    constructor(private readonly poolsService: PoolsService) { }

    /**
     * GET /pools
     * GET /pools?protocol=bifrost
     * GET /pools?asset=DOT
     * GET /pools?poolType=vstaking
     * GET /pools?network=moonbeam
     * GET /pools?minApy=5&sortBy=totalApy&limit=20
     *
     * Returns the latest snapshot per pool, filtered and sorted.
     */
    @Get()
    async getPools(@Query() filter: PoolFilterDto) {
        this.logger.log(`📊 GET /pools — filter: ${JSON.stringify(filter)}`);
        const data = await this.poolsService.getAllPools(filter);
        return {
            success: true,
            count: data.length,
            filter,
            data,
        };
    }

    /**
     * GET /pools/top?limit=10&sortBy=totalApy
     *
     * Convenience endpoint returning top-N pools by a sort field.
     */
    @Get('top')
    async getTopPools(
        @Query('limit') limit = 10,
        @Query('sortBy') sortBy: SortBy = SortBy.TOTAL_APY,
    ) {
        this.logger.log(`📊 GET /pools/top — limit: ${limit}, sortBy: ${sortBy}`);
        const data = await this.poolsService.getTopPools(Number(limit), sortBy);
        return {
            success: true,
            count: data.length,
            sortBy,
            data,
        };
    }

    /**
     * GET /pools/history
     * GET /pools/history?asset=DOT&from=2026-02-01&to=2026-02-22
     *
     * Returns all historical daily snapshots within the range, without deduplication.
     */
    @Get('history')
    async getPoolsHistory(@Query() filter: PoolFilterDto) {
        this.logger.log(`📊 GET /pools/history — filter: ${JSON.stringify(filter)}`);
        const data = await this.poolsService.getPoolsHistory(filter);
        return {
            success: true,
            count: data.length,
            filter,
            data,
        };
    }
}
