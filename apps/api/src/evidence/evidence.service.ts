import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CaseStatus } from '../../generated/prisma/client';
import type { Evidence } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CasesService } from '../cases/cases.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEvidenceDto } from './dto/create-evidence.dto';

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly casesService: CasesService,
  ) {}

  async create(
    actor: AuthenticatedUser,
    caseId: string,
    dto: CreateEvidenceDto,
  ): Promise<Evidence> {
    const kase = await this.casesService.findOne(actor, caseId);
    if (kase.status === CaseStatus.RESOLVED) {
      throw new ConflictException('Cannot add evidence to a resolved case');
    }

    return this.prisma.$transaction(async (tx) => {
      const timelineEvent = await tx.timelineEvent.create({
        data: {
          caseId,
          type: 'evidence_added',
          authorId: actor.userId,
          content: { evidenceType: dto.type, source: dto.source },
        },
      });

      return tx.evidence.create({
        data: {
          caseId,
          timelineEventId: timelineEvent.id,
          type: dto.type,
          source: dto.source,
          content: dto.content,
          timestamp: new Date(dto.timestamp),
          authorId: actor.userId,
        },
      });
    });
  }

  async findAll(actor: AuthenticatedUser, caseId: string): Promise<Evidence[]> {
    // findOne enforces the same visibility rule Cases already uses (analyst
    // must be the assignee; Lead always allowed) — reused, not duplicated.
    await this.casesService.findOne(actor, caseId);
    return this.prisma.evidence.findMany({
      where: { caseId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async findOne(
    actor: AuthenticatedUser,
    caseId: string,
    evidenceId: string,
  ): Promise<Evidence> {
    await this.casesService.findOne(actor, caseId);
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    if (!evidence || evidence.caseId !== caseId) {
      throw new NotFoundException('Evidence not found');
    }
    return evidence;
  }
}
