import { IsUUID } from 'class-validator';

export class ReassignCaseDto {
  @IsUUID('4')
  assigneeId!: string;
}
