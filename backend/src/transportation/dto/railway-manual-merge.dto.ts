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
import { TransportationRailwayManualMergeEntityType } from '@prisma/client';

export class RailwayManualMergeMemberInputDto {
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

export class RailwayManualMergeCreateDto {
  @IsEnum(TransportationRailwayManualMergeEntityType)
  entityType!: TransportationRailwayManualMergeEntityType;

  @IsString()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  englishName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  color?: number | null;

  @IsOptional()
  @IsString()
  logoAttachmentId?: string | null;

  @IsArray()
  members!: RailwayManualMergeMemberInputDto[];
}

export class RailwayManualMergeUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  englishName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  color?: number | null;

  @IsOptional()
  @IsString()
  logoAttachmentId?: string | null;
}
