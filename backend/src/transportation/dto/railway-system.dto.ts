import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TransportationRailwayMod } from '@prisma/client';

export class RailwaySystemRouteInputDto {
  @IsString()
  @MaxLength(128)
  entityId!: string;

  @IsEnum(TransportationRailwayMod)
  railwayType!: TransportationRailwayMod;

  @IsString()
  @MaxLength(64)
  serverId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  dimension?: string | null;
}

export class RailwaySystemCreateDto {
  @IsString()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  englishName?: string | null;

  @IsOptional()
  @IsString()
  logoAttachmentId?: string | null;

  @IsArray()
  routes!: RailwaySystemRouteInputDto[];
}

export class RailwaySystemUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  englishName?: string | null;

  @IsOptional()
  @IsString()
  logoAttachmentId?: string | null;

  @IsOptional()
  @IsArray()
  routes?: RailwaySystemRouteInputDto[];
}

export class RailwaySystemListQueryDto {
  @IsOptional()
  @IsString()
  search?: string | null;

  @IsOptional()
  @IsString()
  serverId?: string | null;

  @IsOptional()
  @IsString()
  dimension?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}
