import { IsOptional, IsString, IsNumber, IsEnum, Min, Max, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { Protocol, PoolType, Network } from '../../../shared/entities/protocol-snapshot.entity';

export enum SortBy {
    TOTAL_APY = 'totalApy',
    SUPPLY_APY = 'supplyApy',
    REWARD_APY = 'rewardApy',
    TVL = 'tvlUsd',
    CRAWLED_AT = 'crawledAt',
}

export class PoolFilterDto {
    @IsOptional()
    @IsEnum(Protocol)
    protocol?: Protocol;

    @IsOptional()
    @IsString()
    asset?: string;

    @IsOptional()
    @IsEnum(PoolType)
    poolType?: PoolType;

    @IsOptional()
    @IsEnum(Network)
    network?: Network;

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
