import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ListTimelineQueryDto } from './dto/list-timeline-query.dto';
import { TimelineService } from './timeline.service';

// Nested under a case, same pattern as Evidence/Investigations — the
// timeline is inherently case-scoped. Read-only: Cases, Investigations, and
// Evidence already write timeline_events; this module adds no write path.
@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId/timeline')
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get()
  findAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Query() query: ListTimelineQueryDto,
  ) {
    return this.timelineService.findAll(actor, caseId, query);
  }
}
