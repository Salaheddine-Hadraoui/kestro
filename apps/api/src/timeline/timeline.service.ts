import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CasesService } from '../cases/cases.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ListTimelineQueryDto } from './dto/list-timeline-query.dto';
import type { PaginatedTimelineEvents } from './types/timeline-event-with-author.type';

@Injectable()
export class TimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly casesService: CasesService,
  ) {}

  async findAll(
    actor: AuthenticatedUser,
    caseId: string,
    query: ListTimelineQueryDto,
  ): Promise<PaginatedTimelineEvents> {
    // findOne enforces the same visibility rule Cases already uses (analyst
    // must be the assignee; Lead always allowed) — reused, not duplicated.
    await this.casesService.findOne(actor, caseId);

    const [data, total] = await Promise.all([
      this.prisma.timelineEvent.findMany({
        where: { caseId },
        // createdAt alone is not a strict total order: Postgres's now()
        // resolves to the transaction start time, so multiple events written
        // in the same transaction (e.g. case creation plus its alert_linked
        // events) can share an identical createdAt. `id` breaks ties
        // deterministically so a given page always returns in the same
        // order on repeat requests — it does not reconstruct insertion order
        // for same-transaction events, which the schema doesn't track.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: query.offset,
        take: query.limit,
        include: {
          author: { select: { id: true, name: true, role: true } },
        },
      }),
      this.prisma.timelineEvent.count({ where: { caseId } }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }
}
