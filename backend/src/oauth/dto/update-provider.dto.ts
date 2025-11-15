import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProviderSettingsDto } from './provider-settings.dto';

export class UpdateOAuthProviderDto {
  @IsOptional()
  @IsString()
  @Length(2, 50)
  key?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  type?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProviderSettingsDto)
  settings?: ProviderSettingsDto;
}
