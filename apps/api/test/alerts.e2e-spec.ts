import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AlertStatus, Severity, UserRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password.util';
import { PrismaService } from '../src/prisma/prisma.service';

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
  rawPayload: Record<string, unknown> | null;
  severity: Severity;
  status: AlertStatus;
  dismissReason: string | null;
  dismissedById: string | null;
  dismissedAt: Date | null;
  createdAt: Date;
}

// Same fake-PrismaService pattern as auth.e2e-spec.ts / users.e2e-spec.ts
// (Prisma's WASM query compiler can't load under Jest's CJS runtime).
function createFakePrisma(seedUsers: FakeUserRow[]) {
  const users = new Map<string, FakeUserRow>(seedUsers.map((u) => [u.id, u]));
  const refreshTokens = new Map<string, FakeRefreshTokenRow>();
  const alerts = new Map<string, FakeAlertRow>();
  let nextAlertId = 1;

  const matchesAlert = (alert: FakeAlertRow, where: Partial<FakeAlertRow>) =>
    (where.status === undefined || alert.status === where.status) &&
    (where.severity === undefined || alert.severity === where.severity);

  return {
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
        data: {
          source: string;
          summary: string;
          severity: Severity;
          rawPayload?: Record<string, unknown>;
        };
      }): FakeAlertRow => {
        const row: FakeAlertRow = {
          id: `alert-${nextAlertId++}`,
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
          .filter((a) => matchesAlert(a, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
      count: ({ where }: { where: Partial<FakeAlertRow> }): number =>
        [...alerts.values()].filter((a) => matchesAlert(a, where)).length,
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
}

describe('Alerts (e2e)', () => {
  let app: INestApplication<App>;
  let analystToken: string;
  let leadToken: string;

  beforeEach(async () => {
    const now = new Date();
    const analyst: FakeUserRow = {
      id: 'analyst-1',
      email: 'analyst@kestro.test',
      passwordHash: await hashPassword('analyst-password'),
      name: 'Analyst One',
      role: UserRole.analyst,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const lead: FakeUserRow = {
      id: 'lead-1',
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
      .useValue(createFakePrisma([analyst, lead]))
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

    const [analystLogin, leadLogin] = await Promise.all([
      request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: analyst.email, password: 'analyst-password' }),
      request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: lead.email, password: 'lead-password' }),
    ]);
    analystToken = (analystLogin.body as { accessToken: string }).accessToken;
    leadToken = (leadLogin.body as { accessToken: string }).accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /alerts', () => {
    it('allows an Analyst to create an alert, defaulting to status "new"', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          source: 'manual',
          summary: 'Suspicious login from new device',
          severity: Severity.high,
        })
        .expect(201);

      expect(response.body).toMatchObject({
        source: 'manual',
        summary: 'Suspicious login from new device',
        severity: Severity.high,
        status: AlertStatus.new,
        dismissReason: null,
      });
    });

    it('allows a Lead to create an alert (no role restriction)', async () => {
      await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${leadToken}`)
        .send({
          source: 'manual',
          summary: 'Lead-reported alert',
          severity: Severity.low,
        })
        .expect(201);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/alerts')
        .send({ source: 'manual', summary: 'x', severity: Severity.low })
        .expect(401);
    });

    it('rejects a malformed body (missing severity)', async () => {
      await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ source: 'manual', summary: 'x' })
        .expect(400);
    });
  });

  describe('GET /alerts', () => {
    it('lists alerts with pagination metadata and supports status filtering', async () => {
      await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ source: 'manual', summary: 'one', severity: Severity.low });
      const second = await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ source: 'manual', summary: 'two', severity: Severity.low });
      const secondId = (second.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/v1/alerts/${secondId}/dismiss`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ reason: 'noise' })
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/v1/alerts')
        .query({ status: AlertStatus.dismissed })
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);

      const body = list.body as { data: { id: string }[]; total: number };
      expect(body.total).toBe(1);
      expect(body.data[0].id).toBe(secondId);
    });
  });

  describe('GET /alerts/:id', () => {
    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .get('/v1/alerts/does-not-exist')
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(404);
    });
  });

  describe('POST /alerts/:id/dismiss', () => {
    it('dismisses a new alert, recording who/when/why', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ source: 'manual', summary: 'x', severity: Severity.medium });
      const id = (created.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .post(`/v1/alerts/${id}/dismiss`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ reason: 'False positive' })
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body).toMatchObject({
        status: AlertStatus.dismissed,
        dismissReason: 'False positive',
        dismissedById: 'analyst-1',
      });
      expect(body.dismissedAt).not.toBeNull();
    });

    it('rejects dismissing an already-dismissed alert', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ source: 'manual', summary: 'x', severity: Severity.medium });
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/v1/alerts/${id}/dismiss`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ reason: 'first' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/alerts/${id}/dismiss`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ reason: 'second' })
        .expect(409);
    });

    it('requires authentication', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ source: 'manual', summary: 'x', severity: Severity.medium });
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/v1/alerts/${id}/dismiss`)
        .send({ reason: 'x' })
        .expect(401);
    });

    it('rejects a missing reason', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/alerts')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ source: 'manual', summary: 'x', severity: Severity.medium });
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/v1/alerts/${id}/dismiss`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({})
        .expect(400);
    });
  });
});
