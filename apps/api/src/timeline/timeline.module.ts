import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';

@Module({
  imports: [CasesModule],
  controllers: [TimelineController],
  providers: [TimelineService],
})
export class TimelineModule {}
