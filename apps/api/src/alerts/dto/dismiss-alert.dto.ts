import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DismissAlertDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
