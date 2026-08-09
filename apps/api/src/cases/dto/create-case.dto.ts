import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Severity } from '../../../generated/prisma/client';

export class CreateCaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsEnum(Severity)
  severity!: Severity;

  // Omitted -> self-assign. A non-Lead may only omit this or set it to
  // their own id (docs/WORKFLOW.md: assigning to someone else is a
  // Lead-only action, independent of state — applied here at creation too).
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  // Alerts to link at creation time (docs/WORKFLOW.md: "creates a new Case
  // in one action, pre-populated from the alert"). Each must currently be
  // status "new".
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  alertIds?: string[];
}
