import { IsUUID } from 'class-validator';

export class LinkAlertDto {
  @IsUUID('4')
  alertId!: string;
}
