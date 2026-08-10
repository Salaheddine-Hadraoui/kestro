import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CaseStatus, Severity, UserRole } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CasesService } from '../cases/cases.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimelineService } from './timeline.service';

interface FakeUserRow {
  id: string;
  name: string;
  role: UserRole;
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

interface FakeTimelineEventRow {
  id: string;
  caseId: string;
  type: string;
  authorId: string;
  content: unknown;
  createdAt: Date;
}

function createPrismaMock(seed: {
  users: FakeUserRow[];
  cases: FakeCaseRow[];
  events?: FakeTimelineEventRow[];
}) {
  const users = new Map<string, FakeUserRow>(seed.users.map((u) => [u.id, u]));
  const cases = new Map<string, FakeCaseRow>(seed.cases.map((c) => [c.id, c]));
  const events = [...(seed.events ?? [])];

  const withAuthor = (event: FakeTimelineEventRow) => {
    const author = users.get(event.authorId);
    if (!author) throw new Error('author not found');
    return {
      ...event,
      author: { id: author.id, name: author.name, role: author.role },
    };
  };

  const sortEvents = (rows: FakeTimelineEventRow[]) =>
    [...rows].sort((a, b) => {
      const byTime = a.createdAt.getTime() - b.createdAt.getTime();
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
    });

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
      findMany: ({
        where,
        skip = 0,
        take,
      }: {
        where: { caseId: string };
        skip?: number;
        take?: number;
      }) => {
        const matching = sortEvents(
          events.filter((e) => e.caseId === where.caseId),
        );
        const page = matching.slice(
          skip,
          take === undefined ? undefined : skip + take,
        );
        return page.map(withAuthor);
      },
      count: ({ where }: { where: { caseId: string } }): number =>
        events.filter((e) => e.caseId === where.caseId).length,
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn(client),
  };

  return { prisma: client as unknown as PrismaService, events };
}

describe('TimelineService', () => {
  const analyst: AuthenticatedUser = {
    userId: 'analyst-1',
    role: UserRole.analyst,
  };
  const otherAnalyst: AuthenticatedUser = {
    userId: 'analyst-2',
    role: UserRole.analyst,
  };
  const lead: AuthenticatedUser = { userId: 'lead-1', role: UserRole.lead };

  const users: FakeUserRow[] = [
    {
      id: 'analyst-1',
      name: 'Analyst One',
      role: UserRole.analyst,
      disabledAt: null,
    },
    {
      id: 'analyst-2',
      name: 'Analyst Two',
      role: UserRole.analyst,
      disabledAt: null,
    },
    { id: 'lead-1', name: 'Lead One', role: UserRole.lead, disabledAt: null },
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

  function makeEvent(
    overrides: Partial<FakeTimelineEventRow> = {},
  ): FakeTimelineEventRow {
    return {
      id: 'evt-1',
      caseId: 'case-1',
      type: 'note',
      authorId: 'analyst-1',
      content: {},
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function createService(
    caseOverrides: Partial<FakeCaseRow> = {},
    events: FakeTimelineEventRow[] = [],
  ) {
    const mock = createPrismaMock({
      users,
      cases: [makeCase(caseOverrides)],
      events,
    });
    const casesService = new CasesService(mock.prisma);
    const service = new TimelineService(mock.prisma, casesService);
    return { service, ...mock };
  }

  it('returns the case timeline with author details, paginated', async () => {
    const { service } = createService({}, [
      makeEvent({
        id: 'evt-1',
        type: 'status_change',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        content: { action: 'create', from: null, to: 'OPEN' },
      }),
      makeEvent({
        id: 'evt-2',
        type: 'evidence_added',
        authorId: 'lead-1',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        content: { evidenceType: 'LOG', source: 'firewall' },
      }),
    ]);

    const result = await service.findAll(analyst, 'case-1', {
      limit: 25,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.data.map((e) => e.id)).toEqual(['evt-1', 'evt-2']);
    expect(result.data[0].author).toEqual({
      id: 'analyst-1',
      name: 'Analyst One',
      role: UserRole.analyst,
    });
    expect(result.data[1].author).toEqual({
      id: 'lead-1',
      name: 'Lead One',
      role: UserRole.lead,
    });
  });

  it('breaks createdAt ties deterministically by id', async () => {
    const tiedAt = new Date('2026-01-01T00:00:00.000Z');
    const { service } = createService({}, [
      makeEvent({ id: 'evt-b', createdAt: tiedAt }),
      makeEvent({ id: 'evt-a', createdAt: tiedAt }),
    ]);

    const result = await service.findAll(analyst, 'case-1', {
      limit: 25,
      offset: 0,
    });

    expect(result.data.map((e) => e.id)).toEqual(['evt-a', 'evt-b']);
  });

  it('applies limit/offset', async () => {
    const { service } = createService(
      {},
      [1, 2, 3].map((n) =>
        makeEvent({
          id: `evt-${n}`,
          createdAt: new Date(`2026-01-0${n}T00:00:00.000Z`),
        }),
      ),
    );

    const result = await service.findAll(analyst, 'case-1', {
      limit: 1,
      offset: 1,
    });

    expect(result.total).toBe(3);
    expect(result.data.map((e) => e.id)).toEqual(['evt-2']);
  });

  it("forbids an Analyst from reading the timeline of a case they aren't assigned to", async () => {
    const { service } = createService();

    await expect(
      service.findAll(otherAnalyst, 'case-1', { limit: 25, offset: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a Lead to read the timeline of any case', async () => {
    const { service } = createService({}, [makeEvent()]);

    const result = await service.findAll(lead, 'case-1', {
      limit: 25,
      offset: 0,
    });
    expect(result.total).toBe(1);
  });

  it('throws NotFoundException for an unknown case', async () => {
    const { service } = createService();

    await expect(
      service.findAll(analyst, 'does-not-exist', { limit: 25, offset: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
