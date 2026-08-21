import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AlertStatus, Severity } from '../../../generated/prisma/client';

export class ListAlertsQueryDto {
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  // Free-text search against Alert.source OR Alert.summary. Trimming/blank
  // handling lives in AlertsService.findAll, matching Task 1's Cases DTO
  // for the identical reason (no @Transform precedent in this codebase).
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
