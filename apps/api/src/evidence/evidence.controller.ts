import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { EvidenceService } from './evidence.service';

// Nested under a case, same pattern as Investigations: evidence only ever
// exists in the context of a case. No update/delete endpoints — evidence is
// append-only (docs/SECURITY.md's audit-trail principle), same as Timeline.
@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId/evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateEvidenceDto,
  ) {
    return this.evidenceService.create(actor, caseId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
  ) {
    return this.evidenceService.findAll(actor, caseId);
  }

  @Get(':evidenceId')
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.evidenceService.findOne(actor, caseId, evidenceId);
  }
}
