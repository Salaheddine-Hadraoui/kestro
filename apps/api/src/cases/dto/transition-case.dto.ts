import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CaseAction } from '../types/case-transitions';

export class TransitionCaseDto {
  @IsEnum(CaseAction)
  action!: CaseAction;

  // Required only for the "resolve" action, enforced in CasesService (the
  // DB-level CHECK constraint on cases.resolution_summary is the backstop).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  resolutionSummary?: string;
}
