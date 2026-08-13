import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Collaboration on a case (docs/WORKFLOW.md step 5) — recorded as a
// `comment`-typed timeline event, same append-only model as every other case
// activity. No separate Comment table: a comment has no fields beyond its
// content.
export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
