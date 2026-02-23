import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BifrostModule } from '../bifrost/bifrost.module';
import { MoonwellModule } from '../moonwell/moonwell.module';
import { HydrationModule } from '../hydration/hydration.module';
import { SnapshotSchedulerService } from './snapshot-scheduler.service';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        BifrostModule,
        MoonwellModule,
        HydrationModule,
    ],
    providers: [SnapshotSchedulerService],
})
export class SchedulerModule { }
