import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  AlertStatus,
  CaseStatus,
  EvidenceType,
  Severity,
  UserRole,
} from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password.util';
import { PrismaService } from '../src/prisma/prisma.service';

const ANALYST_1_ID = '11111111-1111-4111-8111-111111111111';
const ANALYST_2_ID = '22222222-2222-4222-8222-222222222222';
const LEAD_1_ID = '33333333-3333-4333-8333-333333333333';

interface FakeUserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeRefreshTokenRow {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

interface FakeAlertRow {
  id: string;
  source: string;
  summary: string;
  severity: Severity;
  status: AlertStatus;
  createdAt: Date;
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
  createdAt: Date;
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

// Same fake-PrismaService pattern used across every other e2e spec (Prisma's
// WASM query compiler can't load under Jest's CJS runtime).
function createFakePrisma(
  seedUsers: FakeUserRow[],
  seedAlerts: FakeAlertRow[] = [],
) {
  const users = new Map<string, FakeUserRow>(seedUsers.map((u) => [u.id, u]));
  const refreshTokens = new Map<string, FakeRefreshTokenRow>();
  const alerts = new Map<string, FakeAlertRow>(
    seedAlerts.map((a) => [a.id, a]),
  );
  const cases = new Map<string, FakeCaseRow>();
  const caseAlerts = new Map<string, FakeCaseAlertRow>();
  const timelineEvents = new Map<string, FakeTimelineEventRow>();
  const evidence = new Map<string, FakeEvidenceRow>();
  const hypotheses = new Map<string, FakeHypothesisRow>();
  let nextId = 1;
  // CreateCaseDto.alertIds is validated with @IsUUID('4'), so alert IDs
  // handed back from this fake must be UUID-v4-shaped, unlike the other
  // entities here whose IDs never flow through a UUID-validated DTO field.
  const fakeUuid = (n: number) =>
    `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
  let clock = new Date('2026-01-01T00:00:00.000Z').getTime();
  // Monotonically increasing fake clock so every timeline event in this test
  // suite gets a distinct createdAt, exercising ordering without relying on
  // real wall-clock timing between fast supertest requests.
  const tick = () => new Date((clock += 1000));

  const withAuthor = (event: FakeTimelineEventRow) => {
    const author = users.get(event.authorId)!;
    return {
      ...event,
      author: { id: author.id, name: author.name, role: author.role },
    };
  };

  const client = {
    onModuleInit: () => undefined,
    onModuleDestroy: () => undefined,
    user: {
      findUnique: ({
        where,
      }: {
        where: { email?: string; id?: string };
      }): FakeUserRow | null => {
        if (where.email) {
          return (
            [...users.values()].find((u) => u.email === where.email) ?? null
          );
        }
        return users.get(where.id ?? '') ?? null;
      },
    },
    refreshToken: {
      create: ({
        data,
      }: {
        data: { id: string; userId: string; expiresAt: Date };
      }): FakeRefreshTokenRow => {
        const row: FakeRefreshTokenRow = {
          ...data,
          revokedAt: null,
          createdAt: new Date(),
        };
        refreshTokens.set(row.id, row);
        return row;
      },
      findUnique: ({
        where,
      }: {
        where: { id: string };
      }): FakeRefreshTokenRow | null => refreshTokens.get(where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeRefreshTokenRow>;
      }): FakeRefreshTokenRow => {
        const row = refreshTokens.get(where.id);
        if (!row) throw new Error('refresh token not found');
        const updated = { ...row, ...data };
        refreshTokens.set(where.id, updated);
        return updated;
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; revokedAt: null };
        data: Partial<FakeRefreshTokenRow>;
      }): { count: number } => {
        const row = refreshTokens.get(where.id);
        if (!row || row.revokedAt !== null) return { count: 0 };
        refreshTokens.set(where.id, { ...row, ...data });
        return { count: 1 };
      },
    },
    alert: {
      create: ({
        data,
      }: {
        data: { source: string; summary: string; severity: Severity };
      }): FakeAlertRow => {
        const row: FakeAlertRow = {
          id: fakeUuid(nextId++),
          source: data.source,
          summary: data.summary,
          severity: data.severity,
          status: AlertStatus.new,
          createdAt: new Date(),
        };
        alerts.set(row.id, row);
        return row;
      },
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
        const row: FakeCaseAlertRow = { id: `ca-${nextId++}`, ...data };
        caseAlerts.set(row.id, row);
        return row;
      },
      findMany: ({ where }: { where: { caseId: string } }) =>
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
        const row: FakeTimelineEventRow = {
          id: `evt-${nextId++}`,
          ...data,
          createdAt: tick(),
        };
        timelineEvents.set(row.id, row);
        return row;
      },
      findMany: ({
        where,
        skip = 0,
        take,
      }: {
        where: { caseId: string };
        skip?: number;
        take?: number;
      }) =>
        [...timelineEvents.values()]
          .filter((e) => e.caseId === where.caseId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(skip, take === undefined ? undefined : skip + take)
          .map(withAuthor),
      count: ({ where }: { where: { caseId: string } }): number =>
        [...timelineEvents.values()].filter((e) => e.caseId === where.caseId)
          .length,
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
    },
    hypothesis: {
      create: ({
        data,
      }: {
        data: { caseId: string; authorId: string; statement: string };
      }): FakeHypothesisRow => {
        const row: FakeHypothesisRow = {
          id: `hyp-${nextId++}`,
          ...data,
          status: 'proposed',
          conclusionStatement: null,
          resolvedAt: null,
          createdAt: new Date(),
        };
        hypotheses.set(row.id, row);
        return row;
      },
    },
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
      fn(client),
  };

  return client;
}

describe('Timeline (e2e)', () => {
  let app: INestApplication<App>;
  let analystToken: string;
  let otherAnalystToken: string;
  let leadToken: string;
  let caseId: string;

  beforeEach(async () => {
    const now = new Date();
    const analyst: FakeUserRow = {
      id: ANALYST_1_ID,
      email: 'analyst@kestro.test',
      passwordHash: await hashPassword('analyst-password'),
      name: 'Analyst One',
      role: UserRole.analyst,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const otherAnalyst: FakeUserRow = {
      id: ANALYST_2_ID,
      email: 'analyst2@kestro.test',
      passwordHash: await hashPassword('analyst2-password'),
      name: 'Analyst Two',
      role: UserRole.analyst,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const lead: FakeUserRow = {
      id: LEAD_1_ID,
      email: 'lead@kestro.test',
      passwordHash: await hashPassword('lead-password'),
      name: 'Lead One',
      role: UserRole.lead,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma([analyst, otherAnalyst, lead]))
      .compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts's bootstrap() setGlobalPrefix call, which this test harness bypasses.
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const [analystLogin, otherAnalystLogin, leadLogin] = await Promise.all([
      request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: analyst.email, password: 'analyst-password' }),
      request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: otherAnalyst.email, password: 'analyst2-password' }),
      request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: lead.email, password: 'lead-password' }),
    ]);
    analystToken = (analystLogin.body as { accessToken: string }).accessToken;
    otherAnalystToken = (otherAnalystLogin.body as { accessToken: string })
      .accessToken;
    leadToken = (leadLogin.body as { accessToken: string }).accessToken;

    const created = await request(app.getHttpServer())
      .post('/v1/cases')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ title: 'Suspicious activity', severity: Severity.high });
    caseId = (created.body as { id: string }).id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /cases/:caseId/timeline', () => {
    it('returns the full audit history across modules in chronological order', async () => {
      await request(app.getHttpServer())
        .post(`/v1/cases/${caseId}/transitions`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ action: 'begin_triage' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          type: EvidenceType.LOG,
          source: 'firewall',
          content: 'Denied connection from 10.0.0.5 to 10.0.0.10:445',
          timestamp: '2026-01-01T00:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/cases/${caseId}/hypotheses`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ statement: 'Likely a compromised credential' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/cases/${caseId}/notes`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ content: 'Pivoted through the jump host at 10.0.0.5' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/cases/${caseId}/comments`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ content: 'Can someone double-check the timeline on this?' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/v1/cases/${caseId}/timeline`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);

      const body = response.body as {
        data: Array<{
          id: string;
          type: string;
          author: { id: string; name: string; role: string };
          content: unknown;
          createdAt: string;
        }>;
        total: number;
        limit: number;
        offset: number;
      };

      expect(body.total).toBe(6);
      expect(body.data.map((e) => e.type)).toEqual([
        'status_change', // case creation
        'status_change', // begin_triage
        'evidence_added',
        'note', // hypothesis_proposed
        'note', // freeform investigation note
        'comment',
      ]);
      // Chronological order is deterministic and non-decreasing.
      const timestamps = body.data.map((e) => new Date(e.createdAt).getTime());
      expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
      expect(body.data[0].author).toEqual({
        id: ANALYST_1_ID,
        name: 'Analyst One',
        role: UserRole.analyst,
      });
      expect(body.data[4].content).toMatchObject({
        event: 'note_added',
        text: 'Pivoted through the jump host at 10.0.0.5',
      });
      expect(body.data[5].content).toMatchObject({
        text: 'Can someone double-check the timeline on this?',
      });
    });

    it('includes alert_linked events when alerts are linked at case creation', async () => {
      const alertResponse = await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          source: 'siem',
          summary: 'Suspicious login',
          severity: Severity.high,
        })
        .expect(201);
      const alertId = (alertResponse.body as { id: string }).id;

      const caseWithAlert = await request(app.getHttpServer())
        .post('/v1/cases')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          title: 'Case with alert',
          severity: Severity.high,
          alertIds: [alertId],
        })
        .expect(201);
      const linkedCaseId = (caseWithAlert.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .get(`/v1/cases/${linkedCaseId}/timeline`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);

      const body = response.body as { data: Array<{ type: string }> };
      expect(body.data.map((e) => e.type)).toEqual([
        'status_change',
        'alert_linked',
      ]);
    });

    it('supports pagination via limit/offset', async () => {
      await request(app.getHttpServer())
        .post(`/v1/cases/${caseId}/transitions`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ action: 'begin_triage' })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/v1/cases/${caseId}/transitions`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ action: 'start_investigation' })
        .expect(200);

      const page1 = await request(app.getHttpServer())
        .get(`/v1/cases/${caseId}/timeline?limit=2&offset=0`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get(`/v1/cases/${caseId}/timeline?limit=2&offset=2`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);

      const body1 = page1.body as {
        data: Array<{ id: string }>;
        total: number;
      };
      const body2 = page2.body as {
        data: Array<{ id: string }>;
        total: number;
      };
      expect(body1.total).toBe(3);
      expect(body1.data).toHaveLength(2);
      expect(body2.data).toHaveLength(1);
      const ids = [...body1.data, ...body2.data].map((e) => e.id);
      expect(new Set(ids).size).toBe(3);
    });

    it("forbids an Analyst from reading the timeline of a case they aren't assigned to", async () => {
      await request(app.getHttpServer())
        .get(`/v1/cases/${caseId}/timeline`)
        .set('Authorization', `Bearer ${otherAnalystToken}`)
        .expect(403);
    });

    it('allows a Lead to read the timeline of any case', async () => {
      await request(app.getHttpServer())
        .get(`/v1/cases/${caseId}/timeline`)
        .set('Authorization', `Bearer ${leadToken}`)
        .expect(200);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .get(`/v1/cases/${caseId}/timeline`)
        .expect(401);
    });

    it('returns 404 for an unknown case', async () => {
      await request(app.getHttpServer())
        .get('/v1/cases/does-not-exist/timeline')
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(404);
    });

    it('rejects an out-of-range limit', async () => {
      await request(app.getHttpServer())
        .get(`/v1/cases/${caseId}/timeline?limit=1000`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(400);
    });
  });
});
