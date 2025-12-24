import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  TransportationRailwayBindingEntityType,
  TransportationRailwayCompanyBindingType,
  TransportationRailwayMod,
} from '@prisma/client';

export class RailwayCompanyBindingQueryDto {
  @IsEnum(TransportationRailwayBindingEntityType)
  entityType!: TransportationRailwayBindingEntityType;

  @IsString()
  @MaxLength(128)
  entityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serverId?: string | null;

  @IsOptional()
  @IsEnum(TransportationRailwayMod)
  railwayType?: TransportationRailwayMod | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  dimension?: string | null;
}

export class RailwayCompanyBindingUpdateDto extends RailwayCompanyBindingQueryDto {
  @IsArray()
  @IsString({ each: true })
  operatorCompanyIds!: string[];

  @IsArray()
  @IsString({ each: true })
  builderCompanyIds!: string[];
}

export class RailwayCompanyBindingStatsQueryDto {
  @IsEnum(TransportationRailwayCompanyBindingType)
  bindingType!: TransportationRailwayCompanyBindingType;

  @IsOptional()
  @IsEnum(TransportationRailwayBindingEntityType)
  entityType?: TransportationRailwayBindingEntityType;
}

export class RailwayCompanyBindingListQueryDto {
  @IsOptional()
  @IsEnum(TransportationRailwayCompanyBindingType)
  bindingType?: TransportationRailwayCompanyBindingType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}
