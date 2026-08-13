import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Freeform investigation finding (docs/WORKFLOW.md step 4) — recorded as a
// `note`-typed timeline event, same append-only model as every other case
// activity. No separate Note table: a note has no fields beyond its content.
export class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
