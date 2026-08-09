import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CaseStatus, Severity } from '../../../generated/prisma/client';

export class ListCasesQueryDto {
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  // Lead-only in effect: CasesService always scopes an Analyst's query to
  // their own assigneeId regardless of this param (docs/SECURITY.md — case
  // visibility is a hard boundary, not a client-supplied filter).
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

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
