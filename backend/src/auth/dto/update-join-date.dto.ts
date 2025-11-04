import { IsDateString } from 'class-validator';

export class UpdateJoinDateDto {
  @IsDateString()
  joinDate!: string;
}
