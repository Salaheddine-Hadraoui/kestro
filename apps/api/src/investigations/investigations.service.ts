import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CaseStatus } from '../../generated/prisma/client';
import type { Evidence, Hypothesis } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CasesService } from '../cases/cases.service';
import { EvidenceService } from '../evidence/evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateHypothesisDto } from './dto/create-hypothesis.dto';
import type { LinkEvidenceDto } from './dto/link-evidence.dto';
import type { ValidateHypothesisDto } from './dto/validate-hypothesis.dto';

@Injectable()
export class InvestigationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly casesService: CasesService,
    private readonly evidenceService: EvidenceService,
  ) {}

  async create(
    actor: AuthenticatedUser,
    caseId: string,
    dto: CreateHypothesisDto,
  ): Promise<Hypothesis> {
    await this.assertCaseAccessible(actor, caseId);

    return this.prisma.$transaction(async (tx) => {
      const hypothesis = await tx.hypothesis.create({
        data: { caseId, authorId: actor.userId, statement: dto.statement },
      });
      await tx.timelineEvent.create({
        data: {
          caseId,
          type: 'note',
          authorId: actor.userId,
          content: {
            event: 'hypothesis_proposed',
            hypothesisId: hypothesis.id,
            statement: dto.statement,
          },
        },
      });
      return hypothesis;
    });
  }

  async findAll(
    actor: AuthenticatedUser,
    caseId: string,
  ): Promise<Hypothesis[]> {
    // findOne enforces the same visibility rule Cases already uses (analyst
    // must be the assignee; Lead always allowed) — reused, not duplicated.
    await this.casesService.findOne(actor, caseId);
    return this.prisma.hypothesis.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(
    actor: AuthenticatedUser,
    caseId: string,
    hypothesisId: string,
  ): Promise<Hypothesis> {
    await this.casesService.findOne(actor, caseId);
    return this.findHypothesisOrThrow(caseId, hypothesisId);
  }

  async validate(
    actor: AuthenticatedUser,
    caseId: string,
    hypothesisId: string,
    dto: ValidateHypothesisDto,
  ): Promise<Hypothesis> {
    await this.assertCaseAccessible(actor, caseId);
    const hypothesis = await this.findHypothesisOrThrow(caseId, hypothesisId);
    this.assertProposed(hypothesis);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.hypothesis.update({
        where: { id: hypothesisId },
        data: {
          status: 'validated',
          conclusionStatement: dto.conclusionStatement,
          resolvedAt: new Date(),
        },
      });
      await tx.timelineEvent.create({
        data: {
          caseId,
          type: 'note',
          authorId: actor.userId,
          content: {
            event: 'hypothesis_validated',
            hypothesisId,
            conclusionStatement: dto.conclusionStatement,
          },
        },
      });
      return updated;
    });
  }

  async reject(
    actor: AuthenticatedUser,
    caseId: string,
    hypothesisId: string,
  ): Promise<Hypothesis> {
    await this.assertCaseAccessible(actor, caseId);
    const hypothesis = await this.findHypothesisOrThrow(caseId, hypothesisId);
    this.assertProposed(hypothesis);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.hypothesis.update({
        where: { id: hypothesisId },
        data: { status: 'rejected', resolvedAt: new Date() },
      });
      await tx.timelineEvent.create({
        data: {
          caseId,
          type: 'note',
          authorId: actor.userId,
          content: { event: 'hypothesis_rejected', hypothesisId },
        },
      });
      return updated;
    });
  }

  // Links a piece of Case-scoped Evidence to a Hypothesis for evaluation
  // (docs/PRODUCT.md's "evaluating hypotheses against Evidence"). At most
  // one hypothesis per evidence item — mirrors the "one case per alert"
  // rule already used for Alert<->Case linking — so relinking already-linked
  // evidence is rejected, not overwritten. Evidence stays append-only: this
  // sets exactly one field via a narrow, audited action, the same way
  // reassignment mutates a Case without reopening it to generic PATCH.
  async linkEvidence(
    actor: AuthenticatedUser,
    caseId: string,
    hypothesisId: string,
    dto: LinkEvidenceDto,
  ): Promise<Evidence> {
    await this.assertCaseAccessible(actor, caseId);
    await this.findHypothesisOrThrow(caseId, hypothesisId);

    // Reuses EvidenceService.findOne, which already enforces both case
    // visibility and "evidence belongs to this case" (404 otherwise) — not
    // duplicated here, same pattern used throughout this codebase.
    const evidence = await this.evidenceService.findOne(
      actor,
      caseId,
      dto.evidenceId,
    );

    if (evidence.hypothesisId) {
      throw new ConflictException('Evidence is already linked to a hypothesis');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.evidence.update({
        where: { id: evidence.id },
        data: { hypothesisId },
      });
      await tx.timelineEvent.create({
        data: {
          caseId,
          type: 'note',
          authorId: actor.userId,
          content: {
            event: 'evidence_linked_to_hypothesis',
            hypothesisId,
            evidenceId: evidence.id,
          },
        },
      });
      return updated;
    });
  }

  async findLinkedEvidence(
    actor: AuthenticatedUser,
    caseId: string,
    hypothesisId: string,
  ): Promise<Evidence[]> {
    await this.casesService.findOne(actor, caseId);
    await this.findHypothesisOrThrow(caseId, hypothesisId);
    return this.prisma.evidence.findMany({
      where: { hypothesisId },
      orderBy: { timestamp: 'asc' },
    });
  }

  // Enforces case visibility (via CasesService) and blocks new investigative
  // activity on a resolved case — mirrors linkAlert's identical rule for
  // resolved cases in CasesService.
  private async assertCaseAccessible(
    actor: AuthenticatedUser,
    caseId: string,
  ): Promise<void> {
    const kase = await this.casesService.findOne(actor, caseId);
    if (kase.status === CaseStatus.RESOLVED) {
      throw new ConflictException(
        'Cannot add or change hypotheses on a resolved case',
      );
    }
  }

  private assertProposed(hypothesis: Hypothesis): void {
    if (hypothesis.status !== 'proposed') {
      throw new ConflictException(
        `Hypothesis cannot be resolved from status "${hypothesis.status}"`,
      );
    }
  }

  private async findHypothesisOrThrow(
    caseId: string,
    id: string,
  ): Promise<Hypothesis> {
    const hypothesis = await this.prisma.hypothesis.findUnique({
      where: { id },
    });
    if (!hypothesis || hypothesis.caseId !== caseId) {
      throw new NotFoundException('Hypothesis not found');
    }
    return hypothesis;
  }
}
