import { IsString, MaxLength, MinLength } from 'class-validator';

export class AuthmeBindDto {
  @IsString()
  @MaxLength(64)
  authmeId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
