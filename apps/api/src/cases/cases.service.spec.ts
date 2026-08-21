import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertStatus,
  CaseStatus,
  Prisma,
  Severity,
  UserRole,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CasesService } from './cases.service';
import { CaseAction } from './types/case-transitions';

interface FakeUserRow {
  id: string;
  disabledAt: Date | null;
}

interface FakeAlertRow {
  id: string;
  status: AlertStatus;
}

interface FakeCaseRow {
  id: string;
  title: string;
  status: CaseStatus;
  severity: Severity;
  assigneeId: string;
  resolutionSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeCaseAlertRow {
  id: string;
  caseId: string;
  alertId: string;
}

interface FakeTimelineEventRow {
  id: string;
  caseId: string;
  type: string;
  authorId: string;
  content: unknown;
}

function createPrismaMock(seed: {
  users?: FakeUserRow[];
  alerts?: FakeAlertRow[];
  cases?: FakeCaseRow[];
}) {
  const users = new Map<string, FakeUserRow>(
    (seed.users ?? []).map((u) => [u.id, u]),
  );
  const alerts = new Map<string, FakeAlertRow>(
    (seed.alerts ?? []).map((a) => [a.id, a]),
  );
  const cases = new Map<string, FakeCaseRow>(
    (seed.cases ?? []).map((c) => [c.id, c]),
  );
  const caseAlerts = new Map<string, FakeCaseAlertRow>();
  const timelineEvents: FakeTimelineEventRow[] = [];
  let nextId = 1;

  const matchesCase = (kase: FakeCaseRow, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      if (
        typeof value === 'object' &&
        value !== null &&
        'contains' in (value as Record<string, unknown>)
      ) {
        const needle = String(
          (value as { contains: string }).contains,
        ).toLowerCase();
        const haystack = String(
          (kase as unknown as Record<string, unknown>)[key] ?? '',
        ).toLowerCase();
        return haystack.includes(needle);
      }
      return (kase as unknown as Record<string, unknown>)[key] === value;
    });

  const client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }): FakeUserRow | null =>
        users.get(where.id) ?? null,
    },
    alert: {
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
    case: {
      create: ({
        data,
      }: {
        data: { title: string; severity: Severity; assigneeId: string };
      }): FakeCaseRow => {
        const now = new Date();
        const row: FakeCaseRow = {
          id: `case-${nextId++}`,
          title: data.title,
          severity: data.severity,
          assigneeId: data.assigneeId,
          status: CaseStatus.OPEN,
          resolutionSummary: null,
          createdAt: now,
          updatedAt: now,
        };
        cases.set(row.id, row);
        return row;
      },
      findMany: ({
        where,
        take,
        skip,
      }: {
        where: Record<string, unknown>;
        take: number;
        skip: number;
      }): FakeCaseRow[] =>
        [...cases.values()]
          .filter((c) => matchesCase(c, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: ({ where }: { where: Record<string, unknown> }): number =>
        [...cases.values()].filter((c) => matchesCase(c, where)).length,
      findUnique: ({ where }: { where: { id: string } }): FakeCaseRow | null =>
        cases.get(where.id) ?? null,
      findUniqueOrThrow: ({
        where,
      }: {
        where: { id: string };
      }): FakeCaseRow => {
        const row = cases.get(where.id);
        if (!row) throw new Error('case not found');
        return row;
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeCaseRow>;
      }): FakeCaseRow => {
        const row = cases.get(where.id);
        if (!row) throw new Error('case not found');
        const updated = { ...row, ...data, updatedAt: new Date() };
        cases.set(where.id, updated);
        return updated;
      },
    },
    caseAlert: {
      create: ({
        data,
      }: {
        data: { caseId: string; alertId: string };
      }): FakeCaseAlertRow => {
        const alreadyLinked = [...caseAlerts.values()].some(
          (row) => row.alertId === data.alertId,
        );
        if (alreadyLinked) {
          // Mirrors the real case_alerts.alert_id unique index (Postgres
          // raises this as a unique-violation, which Prisma surfaces as
          // P2002) so a race that reaches this point in the mock behaves
          // like the real database instead of an unconstrained Map.
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`alert_id`)',
            { code: 'P2002', clientVersion: 'test' },
          );
        }
        const row: FakeCaseAlertRow = { id: `ca-${nextId++}`, ...data };
        caseAlerts.set(row.id, row);
        return row;
      },
      findMany: ({
        where,
      }: {
        where: { caseId: string };
      }): (FakeCaseAlertRow & { alert: FakeAlertRow })[] =>
        [...caseAlerts.values()]
          .filter((ca) => ca.caseId === where.caseId)
          .map((ca) => ({ ...ca, alert: alerts.get(ca.alertId)! })),
    },
    timelineEvent: {
      create: ({
        data,
      }: {
        data: {
          caseId: string;
          type: string;
          authorId: string;
          content: unknown;
        };
      }): FakeTimelineEventRow => {
        const row: FakeTimelineEventRow = { id: `te-${nextId++}`, ...data };
        timelineEvents.push(row);
        return row;
      },
    },
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
      fn(client),
  };

  return {
    prisma: client as unknown as PrismaService,
    cases,
    alerts,
    caseAlerts,
    timelineEvents,
  };
}

describe('CasesService', () => {
  const analyst: AuthenticatedUser = {
    userId: 'analyst-1',
    role: UserRole.analyst,
  };
  const otherAnalyst: AuthenticatedUser = {
    userId: 'analyst-2',
    role: UserRole.analyst,
  };
  const lead: AuthenticatedUser = { userId: 'lead-1', role: UserRole.lead };

  const activeUsers: FakeUserRow[] = [
    { id: 'analyst-1', disabledAt: null },
    { id: 'analyst-2', disabledAt: null },
    { id: 'lead-1', disabledAt: null },
    { id: 'disabled-1', disabledAt: new Date() },
  ];

  function createService(overrides: { alerts?: FakeAlertRow[] } = {}) {
    const mock = createPrismaMock({
      users: activeUsers,
      alerts: overrides.alerts,
    });
    return { service: new CasesService(mock.prisma), ...mock };
  }

  function makeCase(overrides: Partial<FakeCaseRow> = {}): FakeCaseRow {
    return {
      id: 'case-seed',
      title: 'Seed case',
      status: CaseStatus.OPEN,
      severity: Severity.medium,
      assigneeId: 'analyst-1',
      resolutionSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe('create', () => {
    it('self-assigns when assigneeId is omitted', async () => {
      const { service } = createService();

      const result = await service.create(analyst, {
        title: 'Suspicious activity',
        severity: Severity.high,
      });

      expect(result.assigneeId).toBe(analyst.userId);
      expect(result.status).toBe(CaseStatus.OPEN);
      expect(result.alerts).toEqual([]);
    });

    it('records a status_change timeline event for creation', async () => {
      const { service, timelineEvents } = createService();

      const result = await service.create(analyst, {
        title: 'x',
        severity: Severity.low,
      });

      const event = timelineEvents.find((e) => e.caseId === result.id);
      expect(event).toMatchObject({
        type: 'status_change',
        authorId: analyst.userId,
      });
      expect(event?.content).toMatchObject({
        action: 'create',
        from: null,
        to: 'OPEN',
      });
    });

    it('allows a Lead to assign to another user', async () => {
      const { service } = createService();

      const result = await service.create(lead, {
        title: 'x',
        severity: Severity.low,
        assigneeId: 'analyst-1',
      });

      expect(result.assigneeId).toBe('analyst-1');
    });

    it('forbids an Analyst from assigning to someone else', async () => {
      const { service } = createService();

      await expect(
        service.create(analyst, {
          title: 'x',
          severity: Severity.low,
          assigneeId: otherAnalyst.userId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects assigning to a disabled user', async () => {
      const { service } = createService();

      await expect(
        service.create(lead, {
          title: 'x',
          severity: Severity.low,
          assigneeId: 'disabled-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('links alerts at creation and flips their status', async () => {
      const { service, alerts } = createService({
        alerts: [{ id: 'alert-1', status: AlertStatus.new }],
      });

      const result = await service.create(analyst, {
        title: 'x',
        severity: Severity.medium,
        alertIds: ['alert-1'],
      });

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].id).toBe('alert-1');
      expect(alerts.get('alert-1')?.status).toBe(AlertStatus.linked);
    });

    it('rejects linking an alert that is not "new"', async () => {
      const { service } = createService({
        alerts: [{ id: 'alert-1', status: AlertStatus.dismissed }],
      });

      await expect(
        service.create(analyst, {
          title: 'x',
          severity: Severity.medium,
          alertIds: ['alert-1'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects linking an unknown alert', async () => {
      const { service } = createService();

      await expect(
        service.create(analyst, {
          title: 'x',
          severity: Severity.medium,
          alertIds: ['does-not-exist'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a concurrent link race (P2002) to 409 when linking at case creation', async () => {
      const { service, caseAlerts } = createService({
        alerts: [{ id: 'alert-1', status: AlertStatus.new }],
      });
      caseAlerts.set('existing', {
        id: 'existing',
        caseId: 'other-case',
        alertId: 'alert-1',
      });

      await expect(
        service.create(analyst, {
          title: 'x',
          severity: Severity.medium,
          alertIds: ['alert-1'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    it('scopes an Analyst to their own assigned cases regardless of query', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('a', makeCase({ id: 'a', assigneeId: 'analyst-1' }));
      mock.cases.set('b', makeCase({ id: 'b', assigneeId: 'analyst-2' }));
      const service = new CasesService(mock.prisma);

      const result = await service.findAll(analyst, {
        assigneeId: 'analyst-2',
        limit: 25,
        offset: 0,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('a');
    });

    it('lets a Lead see all cases and filter by assignee', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('a', makeCase({ id: 'a', assigneeId: 'analyst-1' }));
      mock.cases.set('b', makeCase({ id: 'b', assigneeId: 'analyst-2' }));
      const service = new CasesService(mock.prisma);

      const all = await service.findAll(lead, { limit: 25, offset: 0 });
      expect(all.total).toBe(2);

      const filtered = await service.findAll(lead, {
        assigneeId: 'analyst-2',
        limit: 25,
        offset: 0,
      });
      expect(filtered.data).toHaveLength(1);
      expect(filtered.data[0].id).toBe('b');
    });

    it('matches cases whose title contains the query, case-insensitively', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('a', makeCase({ id: 'a', assigneeId: 'analyst-1', title: 'Suspicious VPN login' }));
      mock.cases.set('b', makeCase({ id: 'b', assigneeId: 'analyst-1', title: 'Phishing report' }));
      const service = new CasesService(mock.prisma);

      const result = await service.findAll(analyst, { q: 'vpn', limit: 25, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('a');
    });

    it('combines a search query with an existing status filter (AND, not OR)', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('a', makeCase({ id: 'a', assigneeId: 'analyst-1', title: 'Suspicious VPN login', status: CaseStatus.OPEN }));
      mock.cases.set('b', makeCase({ id: 'b', assigneeId: 'analyst-1', title: 'Suspicious VPN login', status: CaseStatus.RESOLVED }));
      const service = new CasesService(mock.prisma);

      const result = await service.findAll(analyst, {
        q: 'vpn',
        status: CaseStatus.OPEN,
        limit: 25,
        offset: 0,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('a');
    });

    it('still scopes an Analyst to their own cases when a search query is present', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('a', makeCase({ id: 'a', assigneeId: 'analyst-1', title: 'Suspicious VPN login' }));
      mock.cases.set('b', makeCase({ id: 'b', assigneeId: 'analyst-2', title: 'Suspicious VPN login' }));
      const service = new CasesService(mock.prisma);

      const result = await service.findAll(analyst, { q: 'vpn', limit: 25, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('a');
    });

    it('treats a whitespace-only search query as no filter', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('a', makeCase({ id: 'a', assigneeId: 'analyst-1', title: 'Suspicious VPN login' }));
      const service = new CasesService(mock.prisma);

      const result = await service.findAll(analyst, { q: '   ', limit: 25, offset: 0 });

      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('allows a Lead to view any case', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('a', makeCase({ id: 'a', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      const result = await service.findOne(lead, 'a');
      expect(result.id).toBe('a');
    });

    it("forbids an Analyst from viewing a case they aren't assigned to", async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('a', makeCase({ id: 'a', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      await expect(service.findOne(otherAnalyst, 'a')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for an unknown case', async () => {
      const { service } = createService();

      await expect(service.findOne(lead, 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('transition', () => {
    function seedCase(status: CaseStatus, assigneeId = 'analyst-1') {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('c', makeCase({ id: 'c', status, assigneeId }));
      return { service: new CasesService(mock.prisma), ...mock };
    }

    it('begin_triage: OPEN -> TRIAGING for the assigned Analyst', async () => {
      const { service } = seedCase(CaseStatus.OPEN);

      const result = await service.transition(analyst, 'c', {
        action: CaseAction.begin_triage,
      });

      expect(result.status).toBe(CaseStatus.TRIAGING);
    });

    it('escalate is valid from both TRIAGING and INVESTIGATING', async () => {
      const fromTriaging = seedCase(CaseStatus.TRIAGING);
      const r1 = await fromTriaging.service.transition(analyst, 'c', {
        action: CaseAction.escalate,
      });
      expect(r1.status).toBe(CaseStatus.ESCALATED);

      const fromInvestigating = seedCase(CaseStatus.INVESTIGATING);
      const r2 = await fromInvestigating.service.transition(analyst, 'c', {
        action: CaseAction.escalate,
      });
      expect(r2.status).toBe(CaseStatus.ESCALATED);
    });

    it('accept_escalation is Lead-only and reassigns to the accepting Lead', async () => {
      const { service } = seedCase(CaseStatus.ESCALATED, 'analyst-1');

      const result = await service.transition(lead, 'c', {
        action: CaseAction.accept_escalation,
      });

      expect(result.status).toBe(CaseStatus.INVESTIGATING);
      expect(result.assigneeId).toBe(lead.userId);
    });

    it('rejects accept_escalation from an Analyst', async () => {
      const { service } = seedCase(CaseStatus.ESCALATED, 'analyst-1');

      await expect(
        service.transition(analyst, 'c', {
          action: CaseAction.accept_escalation,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('resolve requires a resolutionSummary', async () => {
      const { service } = seedCase(CaseStatus.VERIFYING);

      await expect(
        service.transition(analyst, 'c', { action: CaseAction.resolve }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolve succeeds with a resolutionSummary', async () => {
      const { service } = seedCase(CaseStatus.VERIFYING);

      const result = await service.transition(analyst, 'c', {
        action: CaseAction.resolve,
        resolutionSummary: 'Root cause identified and mitigated',
      });

      expect(result.status).toBe(CaseStatus.RESOLVED);
      expect(result.resolutionSummary).toBe(
        'Root cause identified and mitigated',
      );
    });

    it('reopen is Lead-only', async () => {
      const { service } = seedCase(CaseStatus.RESOLVED);

      await expect(
        service.transition(analyst, 'c', { action: CaseAction.reopen }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const result = await service.transition(lead, 'c', {
        action: CaseAction.reopen,
      });
      expect(result.status).toBe(CaseStatus.INVESTIGATING);
    });

    it('rejects a transition invalid from the current status', async () => {
      const { service } = seedCase(CaseStatus.OPEN);

      await expect(
        service.transition(analyst, 'c', { action: CaseAction.resolve }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("forbids an Analyst from transitioning a case they aren't assigned to", async () => {
      const { service } = seedCase(CaseStatus.OPEN, 'analyst-1');

      await expect(
        service.transition(otherAnalyst, 'c', {
          action: CaseAction.begin_triage,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('linkAlert', () => {
    it('links a new alert to an open case', async () => {
      const mock = createPrismaMock({
        users: activeUsers,
        alerts: [{ id: 'alert-1', status: AlertStatus.new }],
      });
      mock.cases.set('c', makeCase({ id: 'c', status: CaseStatus.OPEN }));
      const service = new CasesService(mock.prisma);

      const result = await service.linkAlert(analyst, 'c', {
        alertId: 'alert-1',
      });

      expect(result.alerts.map((a) => a.id)).toContain('alert-1');
      expect(mock.alerts.get('alert-1')?.status).toBe(AlertStatus.linked);
    });

    it('rejects linking to a resolved case', async () => {
      const mock = createPrismaMock({
        users: activeUsers,
        alerts: [{ id: 'alert-1', status: AlertStatus.new }],
      });
      mock.cases.set(
        'c',
        makeCase({
          id: 'c',
          status: CaseStatus.RESOLVED,
          resolutionSummary: 'done',
        }),
      );
      const service = new CasesService(mock.prisma);

      await expect(
        service.linkAlert(analyst, 'c', { alertId: 'alert-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects linking an already-linked alert', async () => {
      const mock = createPrismaMock({
        users: activeUsers,
        alerts: [{ id: 'alert-1', status: AlertStatus.linked }],
      });
      mock.cases.set('c', makeCase({ id: 'c', status: CaseStatus.OPEN }));
      const service = new CasesService(mock.prisma);

      await expect(
        service.linkAlert(analyst, 'c', { alertId: 'alert-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a concurrent link race (P2002) to 409 instead of leaking a raw Prisma error', async () => {
      const mock = createPrismaMock({
        users: activeUsers,
        alerts: [{ id: 'alert-1', status: AlertStatus.new }],
      });
      mock.cases.set('c', makeCase({ id: 'c', status: CaseStatus.OPEN }));
      // Simulates the exact race window this fix closes: another request's
      // caseAlert.create already committed a row for this alertId (hence
      // this pre-seeded row) between this request's own assertAlertsLinkable
      // read -- which still sees "new", since that read already happened --
      // and this request's own caseAlert.create.
      mock.caseAlerts.set('existing', {
        id: 'existing',
        caseId: 'other-case',
        alertId: 'alert-1',
      });
      const service = new CasesService(mock.prisma);

      await expect(
        service.linkAlert(analyst, 'c', { alertId: 'alert-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reassign', () => {
    it('lets a Lead reassign a case and records a timeline note', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('c', makeCase({ id: 'c', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      const result = await service.reassign(lead, 'c', {
        assigneeId: 'analyst-2',
      });

      expect(result.assigneeId).toBe('analyst-2');
      const event = mock.timelineEvents.find((e) => e.caseId === 'c');
      expect(event).toMatchObject({ type: 'note', authorId: lead.userId });
      expect(event?.content).toMatchObject({
        event: 'assignee_changed',
        fromAssigneeId: 'analyst-1',
        toAssigneeId: 'analyst-2',
      });
    });

    it('rejects reassigning to a disabled user', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('c', makeCase({ id: 'c', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      await expect(
        service.reassign(lead, 'c', { assigneeId: 'disabled-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addNote', () => {
    it('records a note-typed timeline event for the assignee', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('c', makeCase({ id: 'c', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      const result = await service.addNote(analyst, 'c', {
        content: 'Pivoted through the jump host at 10.0.0.5',
      });

      expect(result).toMatchObject({
        caseId: 'c',
        type: 'note',
        authorId: analyst.userId,
      });
      expect(result.content).toMatchObject({
        event: 'note_added',
        text: 'Pivoted through the jump host at 10.0.0.5',
      });
    });

    it('allows a Lead to add a note on any case', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('c', makeCase({ id: 'c', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      await expect(
        service.addNote(lead, 'c', { content: 'Escalation review note' }),
      ).resolves.toMatchObject({ type: 'note' });
    });

    it('forbids an Analyst from adding a note on a case they are not assigned to', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('c', makeCase({ id: 'c', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      await expect(
        service.addNote(otherAnalyst, 'c', { content: 'Not my case' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects adding a note to a resolved case', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set(
        'c',
        makeCase({
          id: 'c',
          assigneeId: 'analyst-1',
          status: CaseStatus.RESOLVED,
          resolutionSummary: 'Fixed',
        }),
      );
      const service = new CasesService(mock.prisma);

      await expect(
        service.addNote(analyst, 'c', { content: 'Too late' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s for a case that does not exist', async () => {
      const { service } = createService();

      await expect(
        service.addNote(analyst, 'does-not-exist', { content: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addComment', () => {
    it('records a comment-typed timeline event', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('c', makeCase({ id: 'c', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      const result = await service.addComment(analyst, 'c', {
        content: 'Can someone double-check the timeline on this?',
      });

      expect(result).toMatchObject({
        caseId: 'c',
        type: 'comment',
        authorId: analyst.userId,
      });
      expect(result.content).toMatchObject({
        text: 'Can someone double-check the timeline on this?',
      });
    });

    it('forbids an Analyst from commenting on a case they are not assigned to', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set('c', makeCase({ id: 'c', assigneeId: 'analyst-1' }));
      const service = new CasesService(mock.prisma);

      await expect(
        service.addComment(otherAnalyst, 'c', { content: 'Not my case' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects commenting on a resolved case', async () => {
      const mock = createPrismaMock({ users: activeUsers });
      mock.cases.set(
        'c',
        makeCase({
          id: 'c',
          assigneeId: 'analyst-1',
          status: CaseStatus.RESOLVED,
          resolutionSummary: 'Fixed',
        }),
      );
      const service = new CasesService(mock.prisma);

      await expect(
        service.addComment(analyst, 'c', { content: 'Too late' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
