import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

@Module({
  imports: [CasesModule, EvidenceModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService],
})
export class InvestigationsModule {}
