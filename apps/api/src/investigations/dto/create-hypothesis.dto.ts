import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateHypothesisDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  statement!: string;
}
