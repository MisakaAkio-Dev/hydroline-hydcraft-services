import { IsBoolean, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class StartOauthDto {
  @IsIn(['LOGIN', 'BIND'])
  mode!: 'LOGIN' | 'BIND';

  @IsUrl(undefined, { message: 'redirectUri must be a valid URL' })
  redirectUri!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
