import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // /health is deliberately DB-independent (see docs/ARCHITECTURE.md).
      // Prisma's WASM query compiler can't load under Jest's CJS runtime
      // without --experimental-vm-modules, so real DB connectivity is
      // verified separately (`prisma db execute`, manual app boot) rather
      // than through this e2e suite.
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => undefined, onModuleDestroy: async () => undefined })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) returns ok status', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
  });

  afterEach(async () => {
    await app.close();
  });
});
