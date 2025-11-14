import { PlayerStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserStatusDto {
  @IsEnum(PlayerStatus)
  status!: PlayerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reasonDetail?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
