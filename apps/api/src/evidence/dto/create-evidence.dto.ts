import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { EvidenceType } from '../../../generated/prisma/client';

export class CreateEvidenceDto {
  @IsEnum(EvidenceType)
  type!: EvidenceType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  source!: string;

  // Text-based only, per docs/WORKFLOW.md and docs/SECURITY.md — no binary
  // uploads in Milestone 1. For SCREENSHOT/FILE-typed evidence, this holds a
  // text reference/description, not raw bytes.
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content!: string;

  // When the observed fact occurred (distinct from createdAt, when it was
  // recorded) — docs/ARCHITECTURE.md.
  @IsISO8601()
  timestamp!: string;
}
