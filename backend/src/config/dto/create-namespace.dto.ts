import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateNamespaceDto {
  @IsString()
  @Matches(/^[a-z0-9._-]+$/)
  @MaxLength(64)
  key!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
