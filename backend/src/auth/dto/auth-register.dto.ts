import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AuthRegisterDto {
  @IsString()
  @IsIn(['EMAIL', 'AUTHME'])
  mode: 'EMAIL' | 'AUTHME' = 'EMAIL';

  @ValidateIf((dto) => dto.mode === 'EMAIL')
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ValidateIf((dto) => dto.mode === 'AUTHME')
  @IsString()
  @MaxLength(64)
  authmeId?: string;

  @ValidateIf((dto) => dto.mode === 'EMAIL')
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ValidateIf((dto) => dto.mode === 'EMAIL')
  @IsOptional()
  @IsString()
  @MaxLength(64)
  minecraftId?: string;

  @ValidateIf((dto) => dto.mode === 'EMAIL')
  @IsOptional()
  @IsString()
  @MaxLength(64)
  minecraftNick?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
