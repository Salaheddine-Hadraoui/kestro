import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CaseStatus,
  EvidenceType,
  Severity,
  UserRole,
} from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CasesService } from '../cases/cases.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from './evidence.service';

interface FakeUserRow {
  id: string;
  disabledAt: Date | null;
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

interface FakeEvidenceRow {
  id: string;
  caseId: string;
  timelineEventId: string;
  type: EvidenceType;
  source: string;
  content: string;
  timestamp: Date;
  authorId: string;
  createdAt: Date;
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
  cases?: FakeCaseRow[];
}) {
  const users = new Map<string, FakeUserRow>(
    (seed.users ?? []).map((u) => [u.id, u]),
  );
  const cases = new Map<string, FakeCaseRow>(
    (seed.cases ?? []).map((c) => [c.id, c]),
  );
  const evidence = new Map<string, FakeEvidenceRow>();
  const timelineEvents = new Map<string, FakeTimelineEventRow>();
  let nextId = 1;

  const client = {
    user: {
      findUnique: ({ where }: { where: { id: string } }): FakeUserRow | null =>
        users.get(where.id) ?? null,
    },
    case: {
      findUnique: ({ where }: { where: { id: string } }): FakeCaseRow | null =>
        cases.get(where.id) ?? null,
    },
    caseAlert: {
      findMany: (): [] => [],
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
        timelineEvents.set(row.id, row);
        return row;
      },
    },
    evidence: {
      create: ({
        data,
      }: {
        data: {
          caseId: string;
          timelineEventId: string;
          type: EvidenceType;
          source: string;
          content: string;
          timestamp: Date;
          authorId: string;
        };
      }): FakeEvidenceRow => {
        const row: FakeEvidenceRow = {
          id: `ev-${nextId++}`,
          ...data,
          createdAt: new Date(),
        };
        evidence.set(row.id, row);
        return row;
      },
      findMany: ({ where }: { where: { caseId: string } }): FakeEvidenceRow[] =>
        [...evidence.values()]
          .filter((e) => e.caseId === where.caseId)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
      findUnique: ({
        where,
      }: {
        where: { id: string };
      }): FakeEvidenceRow | null => evidence.get(where.id) ?? null,
    },
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
      fn(client),
  };

  return {
    prisma: client as unknown as PrismaService,
    cases,
    evidence,
    timelineEvents,
  };
}

describe('EvidenceService', () => {
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
  ];

  function makeCase(overrides: Partial<FakeCaseRow> = {}): FakeCaseRow {
    return {
      id: 'case-1',
      title: 'Seed case',
      status: CaseStatus.INVESTIGATING,
      severity: Severity.medium,
      assigneeId: 'analyst-1',
      resolutionSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function createServices(caseOverrides: Partial<FakeCaseRow> = {}) {
    const mock = createPrismaMock({
      users: activeUsers,
      cases: [makeCase(caseOverrides)],
    });
    const casesService = new CasesService(mock.prisma);
    const service = new EvidenceService(mock.prisma, casesService);
    return { service, ...mock };
  }

  const baseDto = {
    type: EvidenceType.LOG,
    source: 'firewall',
    content: 'Denied connection from 10.0.0.5 to 10.0.0.10:445',
    timestamp: '2026-01-01T00:00:00.000Z',
  };

  describe('create', () => {
    it('creates evidence and a matching evidence_added timeline event', async () => {
      const { service, timelineEvents } = createServices();

      const result = await service.create(analyst, 'case-1', baseDto);

      expect(result).toMatchObject({
        caseId: 'case-1',
        authorId: analyst.userId,
        type: EvidenceType.LOG,
        source: 'firewall',
        content: baseDto.content,
      });
      expect(result.timestamp).toEqual(new Date(baseDto.timestamp));

      const event = timelineEvents.get(result.timelineEventId);
      expect(event).toMatchObject({
        caseId: 'case-1',
        type: 'evidence_added',
        authorId: analyst.userId,
      });
    });

    it("forbids an Analyst from adding evidence to a case they aren't assigned to", async () => {
      const { service } = createServices();

      await expect(
        service.create(otherAnalyst, 'case-1', baseDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a Lead to add evidence to any case', async () => {
      const { service } = createServices();

      const result = await service.create(lead, 'case-1', baseDto);
      expect(result.authorId).toBe(lead.userId);
    });

    it('rejects adding evidence to a resolved case', async () => {
      const { service } = createServices({
        status: CaseStatus.RESOLVED,
        resolutionSummary: 'done',
      });

      await expect(
        service.create(analyst, 'case-1', baseDto),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for an unknown case', async () => {
      const { service } = createServices();

      await expect(
        service.create(analyst, 'does-not-exist', baseDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll / findOne', () => {
    it('lists evidence for an accessible case, ordered by timestamp', async () => {
      const { service } = createServices();
      await service.create(analyst, 'case-1', {
        ...baseDto,
        timestamp: '2026-01-02T00:00:00.000Z',
        content: 'second',
      });
      await service.create(analyst, 'case-1', {
        ...baseDto,
        timestamp: '2026-01-01T00:00:00.000Z',
        content: 'first',
      });

      const result = await service.findAll(analyst, 'case-1');
      expect(result.map((e) => e.content)).toEqual(['first', 'second']);
    });

    it("forbids an Analyst from listing evidence on a case they aren't assigned to", async () => {
      const { service } = createServices();

      await expect(
        service.findAll(otherAnalyst, 'case-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for an unknown evidence id', async () => {
      const { service } = createServices();

      await expect(
        service.findOne(analyst, 'case-1', 'does-not-exist'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the evidence belongs to a different case', async () => {
      const mock = createPrismaMock({
        users: activeUsers,
        cases: [makeCase({ id: 'case-1' }), makeCase({ id: 'case-2' })],
      });
      const casesService = new CasesService(mock.prisma);
      const service = new EvidenceService(mock.prisma, casesService);
      const created = await service.create(analyst, 'case-1', baseDto);

      await expect(
        service.findOne(analyst, 'case-2', created.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
