import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProviderSettingsDto } from './provider-settings.dto';

export class CreateOAuthProviderDto {
  @IsString()
  @Length(2, 50)
  key!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Length(2, 50)
  type!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProviderSettingsDto)
  settings?: ProviderSettingsDto;
}
