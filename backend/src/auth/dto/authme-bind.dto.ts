import { IsString, MaxLength } from 'class-validator';

export class AuthmeBindDto {
  @IsString()
  @MaxLength(64)
  authmeId!: string;

  @IsString()
  password!: string;
}

