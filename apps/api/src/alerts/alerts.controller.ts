import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateAlertDto } from './dto/create-alert.dto';
import { DismissAlertDto } from './dto/dismiss-alert.dto';
import { ListAlertsQueryDto } from './dto/list-alerts-query.dto';

// No @Roles anywhere: alerts have no visibility/ownership scoping in
// docs/ARCHITECTURE.md (unlike Cases) — any authenticated Analyst or Lead
// can create, view, and dismiss alerts (docs/WORKFLOW.md's shared "alert
// queue").
@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  create(@Body() dto: CreateAlertDto) {
    return this.alertsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListAlertsQueryDto) {
    return this.alertsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alertsService.findOne(id);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DismissAlertDto,
  ) {
    return this.alertsService.dismiss(actor, id, dto);
  }
}
