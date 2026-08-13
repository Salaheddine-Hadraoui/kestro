import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateHypothesisDto } from './dto/create-hypothesis.dto';
import { LinkEvidenceDto } from './dto/link-evidence.dto';
import { ValidateHypothesisDto } from './dto/validate-hypothesis.dto';
import { InvestigationsService } from './investigations.service';

// Nested under a case: hypotheses only ever exist in the context of a case's
// investigation (docs/PRODUCT.md). Same JwtAuthGuard-only pattern as
// Cases/Alerts — no role gating, since hypothesis actions inherit Cases'
// visibility rule (analyst-assignee-or-lead) rather than a separate one.
@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId/hypotheses')
export class InvestigationsController {
  constructor(private readonly investigationsService: InvestigationsService) {}

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateHypothesisDto,
  ) {
    return this.investigationsService.create(actor, caseId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
  ) {
    return this.investigationsService.findAll(actor, caseId);
  }

  @Get(':hypothesisId')
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Param('hypothesisId') hypothesisId: string,
  ) {
    return this.investigationsService.findOne(actor, caseId, hypothesisId);
  }

  @Post(':hypothesisId/validate')
  @HttpCode(HttpStatus.OK)
  validate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Param('hypothesisId') hypothesisId: string,
    @Body() dto: ValidateHypothesisDto,
  ) {
    return this.investigationsService.validate(
      actor,
      caseId,
      hypothesisId,
      dto,
    );
  }

  @Post(':hypothesisId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Param('hypothesisId') hypothesisId: string,
  ) {
    return this.investigationsService.reject(actor, caseId, hypothesisId);
  }

  // Links existing, Case-scoped Evidence to this hypothesis — 200, not 201,
  // matching CasesController.linkAlert's "linking an existing resource" tone.
  @Post(':hypothesisId/evidence')
  @HttpCode(HttpStatus.OK)
  linkEvidence(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Param('hypothesisId') hypothesisId: string,
    @Body() dto: LinkEvidenceDto,
  ) {
    return this.investigationsService.linkEvidence(
      actor,
      caseId,
      hypothesisId,
      dto,
    );
  }

  @Get(':hypothesisId/evidence')
  findLinkedEvidence(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Param('hypothesisId') hypothesisId: string,
  ) {
    return this.investigationsService.findLinkedEvidence(
      actor,
      caseId,
      hypothesisId,
    );
  }
}
