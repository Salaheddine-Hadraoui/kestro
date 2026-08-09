import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { validate } from './config/environment-variables';
import { EvidenceModule } from './evidence/evidence.module';
import { HealthModule } from './health/health.module';
import { InvestigationsModule } from './investigations/investigations.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AlertsModule,
    CasesModule,
    InvestigationsModule,
    EvidenceModule,
  ],
})
export class AppModule {}
