/**
 * DTOs for administration system APIs.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAdministrationRegimeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  levelCount!: number;

  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

export class UpdateAdministrationRegimeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  levelCount?: number;

  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

export class CreateAdministrationDivisionTypeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  suffix!: string;

  @IsOptional()
  @IsString()
  abbrSuffix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(20, { each: true })
  allowedLevels!: number[];
}

export class UpdateAdministrationDivisionTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  suffix?: string;

  @IsOptional()
  @IsString()
  abbrSuffix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(20, { each: true })
  allowedLevels?: number[];
}

export class CreateAdministrationDivisionDto {
  @IsString()
  @MinLength(1)
  properName!: string;

  @IsUUID()
  divisionTypeId!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  levelIndex?: number;
}

export class UpdateAdministrationDivisionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  properName?: string;

  @IsOptional()
  @IsUUID()
  divisionTypeId?: string;
}

export class DivisionSearchDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  level?: number;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateAdministrationOrganizationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['AGENCY', 'PUBLIC_INSTITUTION'])
  kind!: 'AGENCY' | 'PUBLIC_INSTITUTION';

  @IsIn(['SERVER', 'LEVEL1', 'LEVEL2'])
  level!: 'SERVER' | 'LEVEL1' | 'LEVEL2';

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class UpdateAdministrationOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(['AGENCY', 'PUBLIC_INSTITUTION'])
  kind?: 'AGENCY' | 'PUBLIC_INSTITUTION';

  @IsOptional()
  @IsIn(['SERVER', 'LEVEL1', 'LEVEL2'])
  level?: 'SERVER' | 'LEVEL1' | 'LEVEL2';

  @IsOptional()
  @IsUUID()
  divisionId?: string | null;

  @IsOptional()
  @IsUUID()
  companyId?: string | null;
}

export class UpdateAdministrationOrganizationMembersDto {
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  managerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  memberIds?: string[];
}

export class AdministrationOrganizationQueryDto {
  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @IsIn(['AGENCY', 'PUBLIC_INSTITUTION'])
  kind?: 'AGENCY' | 'PUBLIC_INSTITUTION';

  @IsOptional()
  @IsString()
  q?: string;
}

export class PublicAdministrationOrganizationQueryDto {
  @IsOptional()
  @IsIn(['AGENCY', 'PUBLIC_INSTITUTION'])
  kind?: 'AGENCY' | 'PUBLIC_INSTITUTION';

  @IsOptional()
  @IsUUID()
  divisionId?: string;
}
