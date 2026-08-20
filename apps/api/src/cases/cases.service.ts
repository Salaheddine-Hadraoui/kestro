import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Case, TimelineEvent } from '../../generated/prisma/client';
import {
  AlertStatus,
  CaseStatus,
  Prisma,
  UserRole,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import type { AddCommentDto } from './dto/add-comment.dto';
import type { AddNoteDto } from './dto/add-note.dto';
import type { CreateCaseDto } from './dto/create-case.dto';
import type { LinkAlertDto } from './dto/link-alert.dto';
import type { ListCasesQueryDto } from './dto/list-cases-query.dto';
import type { ReassignCaseDto } from './dto/reassign-case.dto';
import type { TransitionCaseDto } from './dto/transition-case.dto';
import { findTransitionRule, CaseAction } from './types/case-transitions';
import type {
  CaseWithAlerts,
  PaginatedCases,
} from './types/case-with-alerts.type';

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreateCaseDto,
  ): Promise<CaseWithAlerts> {
    const assigneeId = await this.resolveAssigneeForCreate(
      actor,
      dto.assigneeId,
    );

    const alertIds = dto.alertIds ?? [];
    if (alertIds.length > 0) {
      await this.assertAlertsLinkable(alertIds);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const kase = await tx.case.create({
        data: { title: dto.title, severity: dto.severity, assigneeId },
      });

      await tx.timelineEvent.create({
        data: {
          caseId: kase.id,
          type: 'status_change',
          authorId: actor.userId,
          content: { action: 'create', from: null, to: kase.status },
        },
      });

      for (const alertId of alertIds) {
        await this.createCaseAlertLink(tx, kase.id, alertId);
        await tx.alert.update({
          where: { id: alertId },
          data: { status: AlertStatus.linked },
        });
        await tx.timelineEvent.create({
          data: {
            caseId: kase.id,
            type: 'alert_linked',
            authorId: actor.userId,
            content: { alertId },
          },
        });
      }

      return kase;
    });

    return this.withAlerts(created);
  }

  async findAll(
    actor: AuthenticatedUser,
    query: ListCasesQueryDto,
  ): Promise<PaginatedCases> {
    const where: Prisma.CaseWhereInput = {
      ...(actor.role !== UserRole.lead
        ? { assigneeId: actor.userId }
        : query.assigneeId !== undefined
          ? { assigneeId: query.assigneeId }
          : {}),
      ...(query.status !== undefined && { status: query.status }),
      ...(query.severity !== undefined && { severity: query.severity }),
    };

    const [data, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.case.count({ where }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<CaseWithAlerts> {
    const kase = await this.findCaseOrThrow(id);
    this.assertCanAccess(actor, kase);
    return this.withAlerts(kase);
  }

  async transition(
    actor: AuthenticatedUser,
    id: string,
    dto: TransitionCaseDto,
  ): Promise<CaseWithAlerts> {
    const kase = await this.findCaseOrThrow(id);
    this.assertCanAccess(actor, kase);

    const rule = findTransitionRule(dto.action, kase.status);
    if (!rule) {
      throw new ConflictException(
        `Action "${dto.action}" is not valid from status "${kase.status}"`,
      );
    }
    if (!rule.roles.includes(actor.role)) {
      throw new ForbiddenException(
        `Only ${rule.roles.join(' or ')} may perform "${dto.action}"`,
      );
    }
    if (rule.action === CaseAction.resolve && !dto.resolutionSummary) {
      throw new BadRequestException(
        'resolutionSummary is required to resolve a case',
      );
    }

    const data: Prisma.CaseUncheckedUpdateInput = { status: rule.to };
    const content: Record<string, unknown> = {
      action: rule.action,
      from: rule.from,
      to: rule.to,
    };

    if (rule.action === CaseAction.resolve) {
      data.resolutionSummary = dto.resolutionSummary;
      content.resolutionSummary = dto.resolutionSummary;
    }
    if (rule.action === CaseAction.accept_escalation) {
      data.assigneeId = actor.userId;
      content.newAssigneeId = actor.userId;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.case.update({ where: { id }, data });
      await tx.timelineEvent.create({
        data: {
          caseId: id,
          type: 'status_change',
          authorId: actor.userId,
          content: content as Prisma.InputJsonValue,
        },
      });
      return result;
    });

    return this.withAlerts(updated);
  }

  async linkAlert(
    actor: AuthenticatedUser,
    id: string,
    dto: LinkAlertDto,
  ): Promise<CaseWithAlerts> {
    const kase = await this.findCaseOrThrow(id);
    this.assertCanAccess(actor, kase);

    if (kase.status === CaseStatus.RESOLVED) {
      throw new ConflictException('Cannot link an alert to a resolved case');
    }

    await this.assertAlertsLinkable([dto.alertId]);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.createCaseAlertLink(tx, id, dto.alertId);
      await tx.alert.update({
        where: { id: dto.alertId },
        data: { status: AlertStatus.linked },
      });
      await tx.timelineEvent.create({
        data: {
          caseId: id,
          type: 'alert_linked',
          authorId: actor.userId,
          content: { alertId: dto.alertId },
        },
      });
      return tx.case.findUniqueOrThrow({ where: { id } });
    });

    return this.withAlerts(updated);
  }

  async reassign(
    actor: AuthenticatedUser,
    id: string,
    dto: ReassignCaseDto,
  ): Promise<CaseWithAlerts> {
    const kase = await this.findCaseOrThrow(id);
    await this.assertActiveUser(dto.assigneeId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.case.update({
        where: { id },
        data: { assigneeId: dto.assigneeId },
      });
      await tx.timelineEvent.create({
        data: {
          caseId: id,
          type: 'note',
          authorId: actor.userId,
          content: {
            event: 'assignee_changed',
            fromAssigneeId: kase.assigneeId,
            toAssigneeId: dto.assigneeId,
          },
        },
      });
      return result;
    });

    return this.withAlerts(updated);
  }

  // Freeform investigation note (docs/WORKFLOW.md step 4) — a `note`-typed
  // timeline event. The `note` type is already overloaded for
  // system-generated entries (assignee_changed, hypothesis_*), so a
  // human-authored note carries its own `event` discriminator to stay
  // distinguishable from those.
  async addNote(
    actor: AuthenticatedUser,
    id: string,
    dto: AddNoteDto,
  ): Promise<TimelineEvent> {
    return this.addTimelineEntry(actor, id, 'note', {
      event: 'note_added',
      text: dto.content,
    });
  }

  // Case collaboration (docs/WORKFLOW.md step 5) — a `comment`-typed
  // timeline event. Unlike `note`, `comment` has exactly one meaning, so no
  // discriminator is needed.
  async addComment(
    actor: AuthenticatedUser,
    id: string,
    dto: AddCommentDto,
  ): Promise<TimelineEvent> {
    return this.addTimelineEntry(actor, id, 'comment', {
      text: dto.content,
    });
  }

  private async addTimelineEntry(
    actor: AuthenticatedUser,
    id: string,
    type: 'note' | 'comment',
    content: Prisma.InputJsonValue,
  ): Promise<TimelineEvent> {
    const kase = await this.findCaseOrThrow(id);
    this.assertCanAccess(actor, kase);

    if (kase.status === CaseStatus.RESOLVED) {
      throw new ConflictException(`Cannot add a ${type} to a resolved case`);
    }

    return this.prisma.timelineEvent.create({
      data: { caseId: id, type, authorId: actor.userId, content },
    });
  }

  private async resolveAssigneeForCreate(
    actor: AuthenticatedUser,
    requestedAssigneeId: string | undefined,
  ): Promise<string> {
    if (requestedAssigneeId === undefined) {
      return actor.userId;
    }
    if (requestedAssigneeId !== actor.userId && actor.role !== UserRole.lead) {
      throw new ForbiddenException(
        'Only a Lead can assign a case to someone other than themselves',
      );
    }
    await this.assertActiveUser(requestedAssigneeId);
    return requestedAssigneeId;
  }

  private async assertActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.disabledAt) {
      throw new NotFoundException('Assignee not found or disabled');
    }
  }

  // assertAlertsLinkable (below) reads each alert's status outside this
  // transaction, so two concurrent requests for the same still-"new" alert
  // can both pass that read before either commits. CaseAlert.alertId's
  // unique index is the real backstop for that race; this turns the
  // resulting P2002 into the same 409 assertAlertsLinkable would have
  // thrown had it re-checked a moment later, instead of an unmapped 500.
  private async createCaseAlertLink(
    tx: Prisma.TransactionClient,
    caseId: string,
    alertId: string,
  ): Promise<void> {
    try {
      await tx.caseAlert.create({ data: { caseId, alertId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Alert ${alertId} was linked to another case concurrently`,
        );
      }
      throw error;
    }
  }

  private async assertAlertsLinkable(alertIds: string[]): Promise<void> {
    for (const alertId of alertIds) {
      const alert = await this.prisma.alert.findUnique({
        where: { id: alertId },
      });
      if (!alert) {
        throw new NotFoundException(`Alert ${alertId} not found`);
      }
      if (alert.status !== AlertStatus.new) {
        throw new ConflictException(
          `Alert ${alertId} cannot be linked from status "${alert.status}"`,
        );
      }
    }
  }

  private assertCanAccess(actor: AuthenticatedUser, kase: Case): void {
    if (actor.role !== UserRole.lead && kase.assigneeId !== actor.userId) {
      throw new ForbiddenException('You do not have access to this case');
    }
  }

  private async findCaseOrThrow(id: string): Promise<Case> {
    const kase = await this.prisma.case.findUnique({ where: { id } });
    if (!kase) {
      throw new NotFoundException('Case not found');
    }
    return kase;
  }

  private async withAlerts(kase: Case): Promise<CaseWithAlerts> {
    const caseAlerts = await this.prisma.caseAlert.findMany({
      where: { caseId: kase.id },
      include: { alert: true },
    });
    return { ...kase, alerts: caseAlerts.map((ca) => ca.alert) };
  }
}
