import { Controller, Get, Logger, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { PoolsService } from './pools.service';
import { PoolFilterDto, SortBy } from './dto/pool-filter.dto';

@Controller('pools')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PoolsController {
    private readonly logger = new Logger(PoolsController.name);

    constructor(private readonly poolsService: PoolsService) { }

    // ─── Meta / Simulation Lookup Endpoints ──────────────────────────────────
    // These are cached (5 min TTL) and use MongoDB distinct aggregation.
    // Intended for the simulation/backtest engine's filter dropdowns.

    /**
     * GET /pools/parachains
     * Returns all distinct networks (parachains) that have pool data,
     * along with which protocols are available on each.
     */
    @Get('parachains')
    async getParachains() {
        this.logger.log('GET /pools/parachains');
        const data = await this.poolsService.getDistinctParachains();
        return { success: true, count: data.length, data };
    }

    /**
     * GET /pools/protocol-types
     * Returns all distinct pool types with human-readable labels and categories.
     * e.g. vstaking → "Liquid Staking", dex → "DEX / AMM"
     */
    @Get('protocol-types')
    async getProtocolTypes() {
        this.logger.log('GET /pools/protocol-types');
        const data = await this.poolsService.getDistinctProtocolTypes();
        return { success: true, count: data.length, data };
    }

    /**
     * GET /pools/tokens
     * Returns all distinct asset symbols with the protocols, networks,
     * and pool types they appear in. Use for token-pair selection in simulation.
     */
    @Get('tokens')
    async getTokens() {
        this.logger.log('GET /pools/tokens');
        const data = await this.poolsService.getDistinctTokens();
        return { success: true, count: data.length, data };
    }

    // ─── Pool List Endpoints ──────────────────────────────────────────────────

    /**
     * GET /pools
     * GET /pools?protocol=bifrost&asset=DOT&poolType=vstaking&network=polkadot
     * GET /pools?minApy=5&sortBy=totalApy&limit=20
     *
     * Returns the latest snapshot per pool, filtered and sorted.
     */
    @Get()
    async getPools(@Query() filter: PoolFilterDto) {
        this.logger.log(`GET /pools — filter: ${JSON.stringify(filter)}`);
        const data = await this.poolsService.getAllPools(filter);
        return { success: true, count: data.length, filter, data };
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
        this.logger.log(`GET /pools/top — limit: ${limit}, sortBy: ${sortBy}`);
        const data = await this.poolsService.getTopPools(Number(limit), sortBy);
        return { success: true, count: data.length, sortBy, data };
    }

    /**
     * GET /pools/history
     * GET /pools/history?asset=DOT&from=2026-02-01&to=2026-02-28
     *
     * Returns all historical daily snapshots within the range.
     */
    @Get('history')
    async getPoolsHistory(@Query() filter: PoolFilterDto) {
        this.logger.log(`GET /pools/history — filter: ${JSON.stringify(filter)}`);
        const data = await this.poolsService.getPoolsHistory(filter);
        return { success: true, count: data.length, filter, data };
    }
}
