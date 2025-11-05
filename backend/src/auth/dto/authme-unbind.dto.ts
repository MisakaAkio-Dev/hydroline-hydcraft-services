import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AuthmeUnbindDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}
