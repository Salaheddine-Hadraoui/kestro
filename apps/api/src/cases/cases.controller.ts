import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CasesService } from './cases.service';
import { AddCommentDto } from './dto/add-comment.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { LinkAlertDto } from './dto/link-alert.dto';
import { ListCasesQueryDto } from './dto/list-cases-query.dto';
import { ReassignCaseDto } from './dto/reassign-case.dto';
import { TransitionCaseDto } from './dto/transition-case.dto';

@UseGuards(JwtAuthGuard)
@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCaseDto) {
    return this.casesService.create(actor, dto);
  }

  @Get()
  findAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListCasesQueryDto,
  ) {
    return this.casesService.findAll(actor, query);
  }

  @Get(':id')
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.casesService.findOne(actor, id);
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  transition(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionCaseDto,
  ) {
    return this.casesService.transition(actor, id, dto);
  }

  @Post(':id/alerts')
  @HttpCode(HttpStatus.OK)
  linkAlert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LinkAlertDto,
  ) {
    return this.casesService.linkAlert(actor, id, dto);
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.casesService.addNote(actor, id, dto);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.casesService.addComment(actor, id, dto);
  }

  // Reassignment is a plain attribute change, not a lifecycle transition
  // (docs/WORKFLOW.md) — Lead-only, independent of the case's current status.
  @UseGuards(RolesGuard)
  @Roles(UserRole.lead)
  @Patch(':id')
  reassign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReassignCaseDto,
  ) {
    return this.casesService.reassign(actor, id, dto);
  }
}
