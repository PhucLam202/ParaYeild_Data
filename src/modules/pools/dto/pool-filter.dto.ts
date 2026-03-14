import { IsOptional, IsString, IsNumber, IsEnum, Min, Max, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { Protocol } from '../../../shared/entities/protocol-snapshot.entity';

export enum SortBy {
    TOTAL_APY = 'totalApy',
    SUPPLY_APY = 'supplyApy',
    REWARD_APY = 'rewardApy',
    TVL = 'tvlUsd',
    CRAWLED_AT = 'crawledAt',
    APY_30D_AVG = 'apy30dAvg',
    RISK_SCORE = 'riskScore',
}

export class PoolFilterDto {
    @IsOptional()
    @IsEnum(Protocol)
    protocol?: Protocol;

    @IsOptional()
    @IsString()
    asset?: string;

    @IsOptional()
    @IsString()
    poolType?: string;

    @IsOptional()
    @IsString()
    network?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minApy?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(200)
    limit?: number = 50;

    @IsOptional()
    @IsEnum(SortBy)
    sortBy?: SortBy = SortBy.TOTAL_APY;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    from?: Date;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    to?: Date;
}
