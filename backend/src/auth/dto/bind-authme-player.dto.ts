import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class BindAuthmePlayerDto {
  @ApiProperty({ description: '目标站内用户 ID' })
  @IsString()
  userId!: string;
}
