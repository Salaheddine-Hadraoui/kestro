import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  AlertStatus,
  CaseStatus,
  Severity,
  UserRole,
} from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password.util';
import { PrismaService } from '../src/prisma/prisma.service';

const ANALYST_1_ID = '11111111-1111-4111-8111-111111111111';
const ANALYST_2_ID = '22222222-2222-4222-8222-222222222222';
const LEAD_1_ID = '33333333-3333-4333-8333-333333333333';
const ALERT_1_ID = '44444444-4444-4444-8444-444444444444';

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

// Same fake-PrismaService pattern used across auth/users/alerts e2e specs
// (Prisma's WASM query compiler can't load under Jest's CJS runtime).
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
  let nextId = 1;

  const matches = (
    row: Record<string, unknown>,
    where: Record<string, unknown>,
  ) => Object.entries(where).every(([k, v]) => v === undefined || row[k] === v);

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
          .filter((c) =>
            matches(c as unknown as Record<string, unknown>, where),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: ({ where }: { where: Record<string, unknown> }): number =>
        [...cases.values()].filter((c) =>
          matches(c as unknown as Record<string, unknown>, where),
        ).length,
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
      }) => data,
    },
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
      fn(client),
  };

  return client;
}

describe('Cases (e2e)', () => {
  let app: INestApplication<App>;
  let analystToken: string;
  let analystId: string;
  let otherAnalystToken: string;
  let leadToken: string;

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
      .useValue(
        createFakePrisma(
          [analyst, otherAnalyst, lead],
          [
            {
              id: ALERT_1_ID,
              source: 'manual',
              summary: 'test',
              severity: Severity.high,
              status: AlertStatus.new,
              createdAt: now,
            },
          ],
        ),
      )
      .compile();

    app = moduleFixture.createNestApplication();
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
        .post('/auth/login')
        .send({ email: analyst.email, password: 'analyst-password' }),
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: otherAnalyst.email, password: 'analyst2-password' }),
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: lead.email, password: 'lead-password' }),
    ]);
    analystToken = (analystLogin.body as { accessToken: string }).accessToken;
    analystId = (analystLogin.body as { user: { id: string } }).user.id;
    otherAnalystToken = (otherAnalystLogin.body as { accessToken: string })
      .accessToken;
    leadToken = (leadLogin.body as { accessToken: string }).accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  function createCase(token: string, body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Suspicious activity', severity: Severity.high, ...body });
  }

  describe('POST /cases', () => {
    it('self-assigns an Analyst-created case', async () => {
      const response = await createCase(analystToken).expect(201);
      const body = response.body as Record<string, unknown>;
      expect(body).toMatchObject({
        status: CaseStatus.OPEN,
        assigneeId: analystId,
      });
    });

    it('forbids an Analyst from assigning to someone else', async () => {
      await createCase(analystToken, { assigneeId: ANALYST_2_ID }).expect(403);
    });

    it('allows a Lead to assign to another user', async () => {
      const response = await createCase(leadToken, {
        assigneeId: ANALYST_1_ID,
      }).expect(201);
      expect((response.body as Record<string, unknown>).assigneeId).toBe(
        ANALYST_1_ID,
      );
    });

    it('links an alert at creation time', async () => {
      const response = await createCase(analystToken, {
        alertIds: [ALERT_1_ID],
      }).expect(201);
      const body = response.body as { alerts: { id: string }[] };
      expect(body.alerts.map((a) => a.id)).toContain(ALERT_1_ID);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/cases')
        .send({ title: 'x', severity: Severity.low })
        .expect(401);
    });

    it('rejects a malformed body', async () => {
      await request(app.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ title: 'x' })
        .expect(400);
    });
  });

  describe('visibility', () => {
    it("prevents an Analyst from viewing a case they aren't assigned to", async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .get(`/cases/${id}`)
        .set('Authorization', `Bearer ${otherAnalystToken}`)
        .expect(403);
    });

    it('lets a Lead view any case', async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .get(`/cases/${id}`)
        .set('Authorization', `Bearer ${leadToken}`)
        .expect(200);
    });

    it("scopes an Analyst's list to their own cases", async () => {
      await createCase(analystToken).expect(201);
      await createCase(otherAnalystToken).expect(201);

      const response = await request(app.getHttpServer())
        .get('/cases')
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);

      const body = response.body as { total: number };
      expect(body.total).toBe(1);
    });
  });

  describe('lifecycle transitions', () => {
    it('walks the full forward lifecycle to RESOLVED', async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;

      const transition = (
        action: string,
        extra: Record<string, unknown> = {},
      ) =>
        request(app.getHttpServer())
          .post(`/cases/${id}/transitions`)
          .set('Authorization', `Bearer ${analystToken}`)
          .send({ action, ...extra });

      await transition('begin_triage').expect(200);
      await transition('start_investigation').expect(200);
      await transition('begin_mitigation').expect(200);
      await transition('begin_verification').expect(200);
      const resolved = await transition('resolve', {
        resolutionSummary: 'Root cause found and mitigated',
      }).expect(200);

      expect((resolved.body as Record<string, unknown>).status).toBe(
        CaseStatus.RESOLVED,
      );
    });

    it('escalate + accept_escalation reassigns to the accepting Lead', async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/cases/${id}/transitions`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ action: 'begin_triage' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/cases/${id}/transitions`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ action: 'escalate' })
        .expect(200);

      const accepted = await request(app.getHttpServer())
        .post(`/cases/${id}/transitions`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ action: 'accept_escalation' })
        .expect(200);

      const body = accepted.body as Record<string, unknown>;
      expect(body.status).toBe(CaseStatus.INVESTIGATING);
      expect(body.assigneeId).not.toBe(analystId);
    });

    it('rejects an invalid transition for the current status', async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/cases/${id}/transitions`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ action: 'resolve', resolutionSummary: 'too early' })
        .expect(409);
    });

    it('rejects resolve without a resolutionSummary', async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;
      const transition = (action: string) =>
        request(app.getHttpServer())
          .post(`/cases/${id}/transitions`)
          .set('Authorization', `Bearer ${analystToken}`)
          .send({ action });

      await transition('begin_triage').expect(200);
      await transition('start_investigation').expect(200);
      await transition('begin_mitigation').expect(200);
      await transition('begin_verification').expect(200);
      await transition('resolve').expect(400);
    });
  });

  describe('POST /cases/:id/alerts', () => {
    it('links an existing alert to an open case', async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .post(`/cases/${id}/alerts`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ alertId: ALERT_1_ID })
        .expect(200);

      const body = response.body as { alerts: { id: string }[] };
      expect(body.alerts.map((a) => a.id)).toContain(ALERT_1_ID);
    });
  });

  describe('PATCH /cases/:id (reassign)', () => {
    it('allows a Lead to reassign', async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .patch(`/cases/${id}`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ assigneeId: ANALYST_2_ID })
        .expect(200);

      expect((response.body as Record<string, unknown>).assigneeId).toBe(
        ANALYST_2_ID,
      );
    });

    it('forbids an Analyst from reassigning', async () => {
      const created = await createCase(analystToken).expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .patch(`/cases/${id}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ assigneeId: ANALYST_2_ID })
        .expect(403);
    });
  });
});
