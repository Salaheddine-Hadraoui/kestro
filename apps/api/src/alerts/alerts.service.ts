import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Alert, Prisma } from '../../generated/prisma/client';
import { AlertStatus } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAlertDto } from './dto/create-alert.dto';
import type { DismissAlertDto } from './dto/dismiss-alert.dto';
import type { ListAlertsQueryDto } from './dto/list-alerts-query.dto';
import type { PaginatedAlerts } from './types/paginated-alerts.type';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAlertDto): Promise<Alert> {
    return this.prisma.alert.create({
      data: {
        source: dto.source,
        summary: dto.summary,
        severity: dto.severity,
        rawPayload: dto.rawPayload as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findAll(query: ListAlertsQueryDto): Promise<PaginatedAlerts> {
    const q = query.q?.trim();
    const where: Prisma.AlertWhereInput = {
      ...(query.status !== undefined && { status: query.status }),
      ...(query.severity !== undefined && { severity: query.severity }),
      ...(q && {
        OR: [
          { source: { contains: q, mode: 'insensitive' } },
          { summary: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.alert.count({ where }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async findOne(id: string): Promise<Alert> {
    return this.findAlertOrThrow(id);
  }

  async dismiss(
    actor: AuthenticatedUser,
    id: string,
    dto: DismissAlertDto,
  ): Promise<Alert> {
    const alert = await this.findAlertOrThrow(id);

    if (alert.status !== AlertStatus.new) {
      throw new ConflictException(
        `Alert cannot be dismissed from status "${alert.status}"`,
      );
    }

    return this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.dismissed,
        dismissReason: dto.reason,
        dismissedById: actor.userId,
        dismissedAt: new Date(),
      },
    });
  }

  private async findAlertOrThrow(id: string): Promise<Alert> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    return alert;
  }
}
