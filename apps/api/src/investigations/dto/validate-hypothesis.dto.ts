import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ValidateHypothesisDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  conclusionStatement!: string;
}
