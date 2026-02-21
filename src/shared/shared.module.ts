import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PoolConfigService } from './services/pool-config.service';
import { ActivityLogService } from './services/activity-log.service';
import { BifrostSnapshot, MoonwellSnapshot, HydrationSnapshot } from './entities/protocol-snapshot.entity';
import { CrawlLog } from './entities/crawl-log.entity';

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([BifrostSnapshot, MoonwellSnapshot, HydrationSnapshot, CrawlLog]),
    ],
    providers: [
        PoolConfigService,
        ActivityLogService,
    ],
    exports: [
        PoolConfigService,
        ActivityLogService,
        TypeOrmModule,
    ],
})
export class SharedModule { }
