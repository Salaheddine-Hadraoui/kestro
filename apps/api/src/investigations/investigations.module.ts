import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

@Module({
  imports: [CasesModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService],
})
export class InvestigationsModule {}
