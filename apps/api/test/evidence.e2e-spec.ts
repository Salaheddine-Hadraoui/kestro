import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
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

// Same fake-PrismaService pattern used across every other e2e spec (Prisma's
// WASM query compiler can't load under Jest's CJS runtime).
function createFakePrisma(seedUsers: FakeUserRow[]) {
  const users = new Map<string, FakeUserRow>(seedUsers.map((u) => [u.id, u]));
  const refreshTokens = new Map<string, FakeRefreshTokenRow>();
  const cases = new Map<string, FakeCaseRow>();
  const evidence = new Map<string, FakeEvidenceRow>();
  let nextId = 1;

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
      findMany: (): [] => [],
    },
    timelineEvent: {
      create: ({ data }: { data: { caseId: string } }) => ({
        id: `te-${nextId++}`,
        ...data,
      }),
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

  return client;
}

describe('Evidence (e2e)', () => {
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
    otherAnalystToken = (otherAnalystLogin.body as { accessToken: string })
      .accessToken;
    leadToken = (leadLogin.body as { accessToken: string }).accessToken;

    const created = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ title: 'Suspicious activity', severity: Severity.high });
    caseId = (created.body as { id: string }).id;
  });

  afterEach(async () => {
    await app.close();
  });

  const validEvidence = {
    type: EvidenceType.LOG,
    source: 'firewall',
    content: 'Denied connection from 10.0.0.5 to 10.0.0.10:445',
    timestamp: '2026-01-01T00:00:00.000Z',
  };

  describe('POST /cases/:caseId/evidence', () => {
    it('adds evidence on an accessible case', async () => {
      const response = await request(app.getHttpServer())
        .post(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send(validEvidence)
        .expect(201);

      expect(response.body).toMatchObject({
        caseId,
        type: EvidenceType.LOG,
        source: 'firewall',
        content: validEvidence.content,
      });
    });

    it("forbids an Analyst from adding evidence to a case they aren't assigned to", async () => {
      await request(app.getHttpServer())
        .post(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${otherAnalystToken}`)
        .send(validEvidence)
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post(`/cases/${caseId}/evidence`)
        .send(validEvidence)
        .expect(401);
    });

    it('rejects a malformed body', async () => {
      await request(app.getHttpServer())
        .post(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ type: 'LOG', source: 'firewall' })
        .expect(400);
    });

    it('rejects an invalid timestamp', async () => {
      await request(app.getHttpServer())
        .post(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ ...validEvidence, timestamp: 'not-a-date' })
        .expect(400);
    });
  });

  describe('GET /cases/:caseId/evidence', () => {
    it('lists evidence for the case', async () => {
      await request(app.getHttpServer())
        .post(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send(validEvidence);
      await request(app.getHttpServer())
        .post(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ ...validEvidence, source: 'edr' });

      const response = await request(app.getHttpServer())
        .get(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it("forbids an Analyst from listing evidence on a case they aren't assigned to", async () => {
      await request(app.getHttpServer())
        .get(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${otherAnalystToken}`)
        .expect(403);
    });
  });

  describe('GET /cases/:caseId/evidence/:evidenceId', () => {
    it('returns 404 for an unknown evidence id', async () => {
      await request(app.getHttpServer())
        .get(`/cases/${caseId}/evidence/does-not-exist`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(404);
    });
  });

  describe('resolved case', () => {
    it('rejects adding evidence once the case is resolved', async () => {
      const transition = (
        action: string,
        extra: Record<string, unknown> = {},
      ) =>
        request(app.getHttpServer())
          .post(`/cases/${caseId}/transitions`)
          .set('Authorization', `Bearer ${analystToken}`)
          .send({ action, ...extra });

      await transition('begin_triage').expect(200);
      await transition('start_investigation').expect(200);
      await transition('begin_mitigation').expect(200);
      await transition('begin_verification').expect(200);
      await transition('resolve', { resolutionSummary: 'Mitigated' }).expect(
        200,
      );

      await request(app.getHttpServer())
        .post(`/cases/${caseId}/evidence`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send(validEvidence)
        .expect(409);
    });
  });
});
