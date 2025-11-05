import { GenderType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class UpdateCurrentUserProfileExtraDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  // Regionized phone code (limited to CN/HK/MO/TW on client side)
  @IsOptional()
  @IsString()
  @MaxLength(8)
  phoneCountry?: 'CN' | 'HK' | 'MO' | 'TW';

  // Preferred region (for CN-style address UI)
  @IsOptional()
  @IsString()
  @MaxLength(8)
  regionCountry?: 'CN' | 'HK' | 'MO' | 'TW' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  regionProvince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  regionCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  regionDistrict?: string;
}

export class UpdateCurrentUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  // Allow updating email without verification for now
  @IsOptional()
  @IsEmail()
  @MaxLength(256)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  image?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsEnum(GenderType)
  gender?: GenderType;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  motto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  locale?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCurrentUserProfileExtraDto)
  extra?: UpdateCurrentUserProfileExtraDto;
}
