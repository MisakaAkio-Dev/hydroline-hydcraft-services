import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNamespaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
