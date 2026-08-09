import { ConflictException, NotFoundException } from '@nestjs/common';
import { AlertStatus, Severity } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';

interface FakeAlertRow {
  id: string;
  source: string;
  summary: string;
  rawPayload: Record<string, unknown> | null;
  severity: Severity;
  status: AlertStatus;
  dismissReason: string | null;
  dismissedById: string | null;
  dismissedAt: Date | null;
  createdAt: Date;
}

function createPrismaMock(seedAlerts: FakeAlertRow[] = []) {
  const alerts = new Map<string, FakeAlertRow>(
    seedAlerts.map((a) => [a.id, a]),
  );
  let nextId = 1;

  const matches = (alert: FakeAlertRow, where: Partial<FakeAlertRow>) =>
    (where.status === undefined || alert.status === where.status) &&
    (where.severity === undefined || alert.severity === where.severity);

  const prisma = {
    alert: {
      create: ({
        data,
      }: {
        data: {
          source: string;
          summary: string;
          severity: Severity;
          rawPayload?: Record<string, unknown>;
        };
      }): FakeAlertRow => {
        const row: FakeAlertRow = {
          id: `alert-${nextId++}`,
          source: data.source,
          summary: data.summary,
          severity: data.severity,
          rawPayload: data.rawPayload ?? null,
          status: AlertStatus.new,
          dismissReason: null,
          dismissedById: null,
          dismissedAt: null,
          createdAt: new Date(),
        };
        alerts.set(row.id, row);
        return row;
      },
      findMany: ({
        where,
        take,
        skip,
      }: {
        where: Partial<FakeAlertRow>;
        take: number;
        skip: number;
      }): FakeAlertRow[] =>
        [...alerts.values()]
          .filter((a) => matches(a, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: ({ where }: { where: Partial<FakeAlertRow> }): number =>
        [...alerts.values()].filter((a) => matches(a, where)).length,
      findUnique: ({ where }: { where: { id: string } }): FakeAlertRow | null =>
        alerts.get(where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeAlertRow>;
      }): FakeAlertRow => {
        const row = alerts.get(where.id);
        if (!row) throw new Error('alert not found');
        const updated = { ...row, ...data };
        alerts.set(where.id, updated);
        return updated;
      },
    },
  };

  return { prisma: prisma as unknown as PrismaService, alerts };
}

describe('AlertsService', () => {
  const actor: AuthenticatedUser = { userId: 'user-1', role: UserRole.analyst };

  function createService(seedAlerts: FakeAlertRow[] = []) {
    const { prisma, alerts } = createPrismaMock(seedAlerts);
    return { service: new AlertsService(prisma), alerts };
  }

  function makeAlert(overrides: Partial<FakeAlertRow> = {}): FakeAlertRow {
    return {
      id: 'alert-seed',
      source: 'manual',
      summary: 'Suspicious login',
      rawPayload: null,
      severity: Severity.medium,
      status: AlertStatus.new,
      dismissReason: null,
      dismissedById: null,
      dismissedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  describe('create', () => {
    it('creates an alert defaulting to status "new"', async () => {
      const { service } = createService();

      const result = await service.create({
        source: 'manual',
        summary: 'Suspicious login from new device',
        severity: Severity.high,
      });

      expect(result).toMatchObject({
        source: 'manual',
        summary: 'Suspicious login from new device',
        severity: Severity.high,
        status: AlertStatus.new,
        dismissReason: null,
      });
    });

    it('persists an optional rawPayload', async () => {
      const { service } = createService();

      const result = await service.create({
        source: 'manual',
        summary: 'test',
        severity: Severity.low,
        rawPayload: { ip: '10.0.0.1' },
      });

      expect(result.rawPayload).toEqual({ ip: '10.0.0.1' });
    });
  });

  describe('findAll', () => {
    it('paginates and reports total independent of the page', async () => {
      const seed = Array.from({ length: 5 }, (_, i) =>
        makeAlert({ id: `alert-${i}`, summary: `Alert ${i}` }),
      );
      const { service } = createService(seed);

      const result = await service.findAll({
        limit: 2,
        offset: 0,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(0);
    });

    it('filters by status', async () => {
      const seed = [
        makeAlert({ id: 'a', status: AlertStatus.new }),
        makeAlert({ id: 'b', status: AlertStatus.dismissed }),
      ];
      const { service } = createService(seed);

      const result = await service.findAll({
        status: AlertStatus.dismissed,
        limit: 25,
        offset: 0,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('b');
      expect(result.total).toBe(1);
    });

    it('filters by severity', async () => {
      const seed = [
        makeAlert({ id: 'a', severity: Severity.low }),
        makeAlert({ id: 'b', severity: Severity.critical }),
      ];
      const { service } = createService(seed);

      const result = await service.findAll({
        severity: Severity.critical,
        limit: 25,
        offset: 0,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('b');
    });
  });

  describe('findOne', () => {
    it('returns the alert for a known id', async () => {
      const { service } = createService([makeAlert({ id: 'alert-1' })]);

      const result = await service.findOne('alert-1');

      expect(result.id).toBe('alert-1');
    });

    it('throws NotFoundException for an unknown id', async () => {
      const { service } = createService();

      await expect(service.findOne('does-not-exist')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('dismiss', () => {
    it('dismisses a "new" alert, recording who/when/why', async () => {
      const { service } = createService([
        makeAlert({ id: 'alert-1', status: AlertStatus.new }),
      ]);

      const result = await service.dismiss(actor, 'alert-1', {
        reason: 'False positive',
      });

      expect(result.status).toBe(AlertStatus.dismissed);
      expect(result.dismissReason).toBe('False positive');
      expect(result.dismissedById).toBe(actor.userId);
      expect(result.dismissedAt).toBeInstanceOf(Date);
    });

    it('rejects dismissing an already-dismissed alert', async () => {
      const { service } = createService([
        makeAlert({ id: 'alert-1', status: AlertStatus.dismissed }),
      ]);

      await expect(
        service.dismiss(actor, 'alert-1', { reason: 'again' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects dismissing a linked alert', async () => {
      const { service } = createService([
        makeAlert({ id: 'alert-1', status: AlertStatus.linked }),
      ]);

      await expect(
        service.dismiss(actor, 'alert-1', { reason: 'too late' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for an unknown alert', async () => {
      const { service } = createService();

      await expect(
        service.dismiss(actor, 'does-not-exist', { reason: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
