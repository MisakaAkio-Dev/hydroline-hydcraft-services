import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { OAuthLogAction, OAuthLogStatus } from '@prisma/client';

export class ListOauthLogsDto {
  @IsOptional()
  @IsString()
  providerKey?: string;

  @IsOptional()
  @IsEnum(OAuthLogAction)
  action?: OAuthLogAction;

  @IsOptional()
  @IsEnum(OAuthLogStatus)
  status?: OAuthLogStatus;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
