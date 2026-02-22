import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from './shared/shared.module';
import { BifrostModule } from './modules/bifrost/bifrost.module';
import { MoonwellModule } from './modules/moonwell/moonwell.module';
import { HydrationModule } from './modules/hydration/hydration.module';
import { PoolsModule } from './modules/pools/pools.module';
import { BifrostSnapshot, MoonwellSnapshot, HydrationSnapshot } from './shared/entities/protocol-snapshot.entity';
import { CrawlLog } from './shared/entities/crawl-log.entity';

@Module({
    imports: [
        // ── Infrastructure ───────────────────────────────────────────────────
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),

        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'mongodb',
                url: config.get<string>('MONGODB_URI'),
                entities: [BifrostSnapshot, MoonwellSnapshot, HydrationSnapshot, CrawlLog],
                synchronize: true, // Only for development
            }),
        }),

        SharedModule, // Provides PoolConfigService + FileLoggerUtil globally

        // ── Protocol Modules ─────────────────────────────────────────────────
        BifrostModule,
        MoonwellModule,
        HydrationModule,

        // ── Data-Serving Modules ──────────────────────────────────────────────
        PoolsModule,  // GET /pools* — aggregated pool data for Main BE
    ],
})
export class AppModule { }
