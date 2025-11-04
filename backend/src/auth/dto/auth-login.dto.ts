import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class AuthLoginDto {
  @IsString()
  @IsIn(['EMAIL', 'AUTHME'])
  mode: 'EMAIL' | 'AUTHME' = 'EMAIL';

  @ValidateIf((dto) => dto.mode === 'EMAIL')
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((dto) => dto.mode === 'AUTHME')
  @IsString()
  @MaxLength(64)
  authmeId?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
