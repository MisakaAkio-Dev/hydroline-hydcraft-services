import {
  IsArray,
  IsOptional,
  IsString,
  IsBoolean,
  ArrayNotEmpty,
  ArrayUnique,
} from 'class-validator';

export class ProviderSettingsDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  authorizeUrl?: string;

  @IsOptional()
  @IsString()
  tokenUrl?: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;

  @IsOptional()
  @IsString()
  graphUserUrl?: string;

  @IsOptional()
  @IsString()
  graphPhotoUrl?: string;

  // 是否为当前 Provider 启用代理中转
  @IsOptional()
  @IsBoolean()
  providerProxyEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  scopes?: string[];
}
