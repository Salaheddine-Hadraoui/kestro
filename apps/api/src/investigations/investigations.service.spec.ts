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
import { EvidenceService } from '../evidence/evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvestigationsService } from './investigations.service';

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

interface FakeHypothesisRow {
  id: string;
  caseId: string;
  authorId: string;
  statement: string;
  status: string;
  conclusionStatement: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

interface FakeTimelineEventRow {
  id: string;
  caseId: string;
  type: string;
  authorId: string;
  content: unknown;
}

interface FakeEvidenceRow {
  id: string;
  caseId: string;
  timelineEventId: string;
  hypothesisId: string | null;
  type: EvidenceType;
  source: string;
  content: string;
  timestamp: Date;
  authorId: string;
  createdAt: Date;
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
  const hypotheses = new Map<string, FakeHypothesisRow>();
  const evidence = new Map<string, FakeEvidenceRow>();
  const timelineEvents: FakeTimelineEventRow[] = [];
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
    hypothesis: {
      create: ({
        data,
      }: {
        data: { caseId: string; authorId: string; statement: string };
      }): FakeHypothesisRow => {
        const row: FakeHypothesisRow = {
          id: `hyp-${nextId++}`,
          caseId: data.caseId,
          authorId: data.authorId,
          statement: data.statement,
          status: 'proposed',
          conclusionStatement: null,
          resolvedAt: null,
          createdAt: new Date(),
        };
        hypotheses.set(row.id, row);
        return row;
      },
      findMany: ({
        where,
      }: {
        where: { caseId: string };
      }): FakeHypothesisRow[] =>
        [...hypotheses.values()]
          .filter((h) => h.caseId === where.caseId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      findUnique: ({
        where,
      }: {
        where: { id: string };
      }): FakeHypothesisRow | null => hypotheses.get(where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeHypothesisRow>;
      }): FakeHypothesisRow => {
        const row = hypotheses.get(where.id);
        if (!row) throw new Error('hypothesis not found');
        const updated = { ...row, ...data };
        hypotheses.set(where.id, updated);
        return updated;
      },
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
          hypothesisId: null,
          ...data,
          createdAt: new Date(),
        };
        evidence.set(row.id, row);
        return row;
      },
      findUnique: ({
        where,
      }: {
        where: { id: string };
      }): FakeEvidenceRow | null => evidence.get(where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeEvidenceRow>;
      }): FakeEvidenceRow => {
        const row = evidence.get(where.id);
        if (!row) throw new Error('evidence not found');
        const updated = { ...row, ...data };
        evidence.set(where.id, updated);
        return updated;
      },
      findMany: ({
        where,
      }: {
        where: { hypothesisId?: string; caseId?: string };
      }): FakeEvidenceRow[] =>
        [...evidence.values()]
          .filter(
            (e) =>
              (where.hypothesisId === undefined ||
                e.hypothesisId === where.hypothesisId) &&
              (where.caseId === undefined || e.caseId === where.caseId),
          )
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    },
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
      fn(client),
  };

  return {
    prisma: client as unknown as PrismaService,
    cases,
    hypotheses,
    evidence,
    timelineEvents,
  };
}

describe('InvestigationsService', () => {
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

  function createServices(
    caseOverrides: Partial<FakeCaseRow> = {},
    extraCases: FakeCaseRow[] = [],
  ) {
    const mock = createPrismaMock({
      users: activeUsers,
      cases: [makeCase(caseOverrides), ...extraCases],
    });
    const casesService = new CasesService(mock.prisma);
    const evidenceService = new EvidenceService(mock.prisma, casesService);
    const service = new InvestigationsService(
      mock.prisma,
      casesService,
      evidenceService,
    );
    return { service, evidenceService, ...mock };
  }

  const baseEvidenceDto = {
    type: EvidenceType.LOG,
    source: 'firewall',
    content: 'Denied connection from 10.0.0.5 to 10.0.0.10:445',
    timestamp: '2026-01-01T00:00:00.000Z',
  };

  describe('create', () => {
    it('proposes a hypothesis and records a timeline event', async () => {
      const { service, timelineEvents } = createServices();

      const result = await service.create(analyst, 'case-1', {
        statement: 'Attacker used stolen credentials',
      });

      expect(result).toMatchObject({
        caseId: 'case-1',
        authorId: analyst.userId,
        status: 'proposed',
        statement: 'Attacker used stolen credentials',
      });
      const event = timelineEvents.find((e) => e.caseId === 'case-1');
      expect(event).toMatchObject({ type: 'note', authorId: analyst.userId });
      expect(event?.content).toMatchObject({ event: 'hypothesis_proposed' });
    });

    it("forbids an Analyst from proposing on a case they aren't assigned to", async () => {
      const { service } = createServices();

      await expect(
        service.create(otherAnalyst, 'case-1', { statement: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a Lead to propose on any case', async () => {
      const { service } = createServices();

      const result = await service.create(lead, 'case-1', { statement: 'x' });
      expect(result.authorId).toBe(lead.userId);
    });

    it('rejects proposing on a resolved case', async () => {
      const { service } = createServices({
        status: CaseStatus.RESOLVED,
        resolutionSummary: 'done',
      });

      await expect(
        service.create(analyst, 'case-1', { statement: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for an unknown case', async () => {
      const { service } = createServices();

      await expect(
        service.create(analyst, 'does-not-exist', { statement: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll / findOne', () => {
    it('lists hypotheses for an accessible case', async () => {
      const { service } = createServices();
      await service.create(analyst, 'case-1', { statement: 'a' });
      await service.create(analyst, 'case-1', { statement: 'b' });

      const result = await service.findAll(analyst, 'case-1');
      expect(result).toHaveLength(2);
    });

    it("forbids an Analyst from listing hypotheses on a case they aren't assigned to", async () => {
      const { service } = createServices();

      await expect(
        service.findAll(otherAnalyst, 'case-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for an unknown hypothesis', async () => {
      const { service } = createServices();

      await expect(
        service.findOne(analyst, 'case-1', 'does-not-exist'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('validate', () => {
    it('validates a proposed hypothesis with a conclusion', async () => {
      const { service, timelineEvents } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });

      const result = await service.validate(analyst, 'case-1', hyp.id, {
        conclusionStatement: 'Confirmed via log analysis',
      });

      expect(result.status).toBe('validated');
      expect(result.conclusionStatement).toBe('Confirmed via log analysis');
      expect(result.resolvedAt).toBeInstanceOf(Date);
      expect(
        timelineEvents.some(
          (e) =>
            e.type === 'note' &&
            (e.content as Record<string, unknown>).event ===
              'hypothesis_validated',
        ),
      ).toBe(true);
    });

    it('rejects validating an already-resolved hypothesis', async () => {
      const { service } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });
      await service.validate(analyst, 'case-1', hyp.id, {
        conclusionStatement: 'first',
      });

      await expect(
        service.validate(analyst, 'case-1', hyp.id, {
          conclusionStatement: 'second',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects validating on a resolved case', async () => {
      const { service, cases } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });
      cases.set('case-1', {
        ...cases.get('case-1')!,
        status: CaseStatus.RESOLVED,
        resolutionSummary: 'done',
      });

      await expect(
        service.validate(analyst, 'case-1', hyp.id, {
          conclusionStatement: 'too late',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject', () => {
    it('rejects a proposed hypothesis with no conclusion required', async () => {
      const { service, timelineEvents } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });

      const result = await service.reject(analyst, 'case-1', hyp.id);

      expect(result.status).toBe('rejected');
      expect(result.conclusionStatement).toBeNull();
      expect(result.resolvedAt).toBeInstanceOf(Date);
      expect(
        timelineEvents.some(
          (e) =>
            (e.content as Record<string, unknown>).event ===
            'hypothesis_rejected',
        ),
      ).toBe(true);
    });

    it('rejects rejecting an already-resolved hypothesis', async () => {
      const { service } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });
      await service.reject(analyst, 'case-1', hyp.id);

      await expect(
        service.reject(analyst, 'case-1', hyp.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('linkEvidence', () => {
    it('links evidence to a hypothesis and records a timeline event', async () => {
      const { service, evidenceService, timelineEvents } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });
      const evidence = await evidenceService.create(
        analyst,
        'case-1',
        baseEvidenceDto,
      );

      const result = await service.linkEvidence(analyst, 'case-1', hyp.id, {
        evidenceId: evidence.id,
      });

      expect(result.hypothesisId).toBe(hyp.id);
      expect(
        timelineEvents.some(
          (e) =>
            (e.content as Record<string, unknown>).event ===
            'evidence_linked_to_hypothesis',
        ),
      ).toBe(true);
    });

    it('allows a Lead to link evidence on any case', async () => {
      const { service, evidenceService } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });
      const evidence = await evidenceService.create(
        lead,
        'case-1',
        baseEvidenceDto,
      );

      await expect(
        service.linkEvidence(lead, 'case-1', hyp.id, {
          evidenceId: evidence.id,
        }),
      ).resolves.toMatchObject({ hypothesisId: hyp.id });
    });

    it("forbids an Analyst from linking evidence on a case they aren't assigned to", async () => {
      const { service, evidenceService } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });
      const evidence = await evidenceService.create(
        analyst,
        'case-1',
        baseEvidenceDto,
      );

      await expect(
        service.linkEvidence(otherAnalyst, 'case-1', hyp.id, {
          evidenceId: evidence.id,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for an unknown hypothesis', async () => {
      const { service, evidenceService } = createServices();
      const evidence = await evidenceService.create(
        analyst,
        'case-1',
        baseEvidenceDto,
      );

      await expect(
        service.linkEvidence(analyst, 'case-1', 'does-not-exist', {
          evidenceId: evidence.id,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for an unknown evidence id', async () => {
      const { service } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });

      await expect(
        service.linkEvidence(analyst, 'case-1', hyp.id, {
          evidenceId: 'does-not-exist',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects linking evidence that belongs to a different case', async () => {
      const { service, evidenceService } = createServices({}, [
        makeCase({ id: 'case-2', assigneeId: 'analyst-1' }),
      ]);
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });
      const evidenceOnOtherCase = await evidenceService.create(
        analyst,
        'case-2',
        baseEvidenceDto,
      );

      await expect(
        service.linkEvidence(analyst, 'case-1', hyp.id, {
          evidenceId: evidenceOnOtherCase.id,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects linking a hypothesis that belongs to a different case', async () => {
      const { service, evidenceService } = createServices({}, [
        makeCase({ id: 'case-2', assigneeId: 'analyst-1' }),
      ]);
      const hypOnOtherCase = await service.create(analyst, 'case-2', {
        statement: 'x',
      });
      const evidence = await evidenceService.create(
        analyst,
        'case-1',
        baseEvidenceDto,
      );

      await expect(
        service.linkEvidence(analyst, 'case-1', hypOnOtherCase.id, {
          evidenceId: evidence.id,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects linking evidence that is already linked to a hypothesis', async () => {
      const { service, evidenceService } = createServices();
      const hyp1 = await service.create(analyst, 'case-1', {
        statement: 'first hypothesis',
      });
      const hyp2 = await service.create(analyst, 'case-1', {
        statement: 'second hypothesis',
      });
      const evidence = await evidenceService.create(
        analyst,
        'case-1',
        baseEvidenceDto,
      );
      await service.linkEvidence(analyst, 'case-1', hyp1.id, {
        evidenceId: evidence.id,
      });

      await expect(
        service.linkEvidence(analyst, 'case-1', hyp2.id, {
          evidenceId: evidence.id,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      // Re-linking to the very same hypothesis is rejected too — the
      // relationship is set-once, not idempotent.
      await expect(
        service.linkEvidence(analyst, 'case-1', hyp1.id, {
          evidenceId: evidence.id,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects linking evidence on a resolved case', async () => {
      const { service, evidenceService, cases } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });
      const evidence = await evidenceService.create(
        analyst,
        'case-1',
        baseEvidenceDto,
      );
      cases.set('case-1', {
        ...cases.get('case-1')!,
        status: CaseStatus.RESOLVED,
        resolutionSummary: 'done',
      });

      await expect(
        service.linkEvidence(analyst, 'case-1', hyp.id, {
          evidenceId: evidence.id,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findLinkedEvidence', () => {
    it('lists only evidence linked to the given hypothesis', async () => {
      const { service, evidenceService } = createServices();
      const hyp1 = await service.create(analyst, 'case-1', {
        statement: 'first hypothesis',
      });
      const hyp2 = await service.create(analyst, 'case-1', {
        statement: 'second hypothesis',
      });
      const linked = await evidenceService.create(
        analyst,
        'case-1',
        baseEvidenceDto,
      );
      const unlinked = await evidenceService.create(
        analyst,
        'case-1',
        baseEvidenceDto,
      );
      await service.linkEvidence(analyst, 'case-1', hyp1.id, {
        evidenceId: linked.id,
      });

      const resultForHyp1 = await service.findLinkedEvidence(
        analyst,
        'case-1',
        hyp1.id,
      );
      const resultForHyp2 = await service.findLinkedEvidence(
        analyst,
        'case-1',
        hyp2.id,
      );

      expect(resultForHyp1.map((e) => e.id)).toEqual([linked.id]);
      expect(resultForHyp1.map((e) => e.id)).not.toContain(unlinked.id);
      expect(resultForHyp2).toEqual([]);
    });

    it("forbids an Analyst from reading evidence on a case they aren't assigned to", async () => {
      const { service } = createServices();
      const hyp = await service.create(analyst, 'case-1', { statement: 'x' });

      await expect(
        service.findLinkedEvidence(otherAnalyst, 'case-1', hyp.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException for an unknown hypothesis', async () => {
      const { service } = createServices();

      await expect(
        service.findLinkedEvidence(analyst, 'case-1', 'does-not-exist'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
