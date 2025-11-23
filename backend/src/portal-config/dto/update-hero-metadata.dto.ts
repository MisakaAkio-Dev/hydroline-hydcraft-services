import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateHeroMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @IsISO8601()
  shootAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  photographer?: string | null;
}
