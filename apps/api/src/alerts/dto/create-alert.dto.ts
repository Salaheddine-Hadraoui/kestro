import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Severity } from '../../../generated/prisma/client';

export class CreateAlertDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  source!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  summary!: string;

  @IsEnum(Severity)
  severity!: Severity;

  // Optional structured detail (docs/ARCHITECTURE.md). Kept as a plain
  // object rather than arbitrary JSON — an array or primitive at the top
  // level isn't a meaningful "structured detail" for an alert.
  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}
