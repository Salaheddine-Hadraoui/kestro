import { IsUUID } from 'class-validator';

export class LinkEvidenceDto {
  @IsUUID('4')
  evidenceId!: string;
}
