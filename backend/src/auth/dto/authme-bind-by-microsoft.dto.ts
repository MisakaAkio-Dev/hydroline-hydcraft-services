import { IsString, MaxLength } from 'class-validator';

export class AuthmeBindByMicrosoftDto {
  @IsString()
  @MaxLength(64)
  authmeId!: string;
}
