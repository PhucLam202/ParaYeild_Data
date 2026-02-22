import { Module } from '@nestjs/common';
import { PoolsService } from './pools.service';
import { PoolsController } from './pools.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    BifrostSnapshot,
    MoonwellSnapshot,
    HydrationSnapshot,
} from '../../shared/entities/protocol-snapshot.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([BifrostSnapshot, MoonwellSnapshot, HydrationSnapshot]),
    ],
    controllers: [PoolsController],
    providers: [PoolsService],
    exports: [PoolsService],
})
export class PoolsModule { }
