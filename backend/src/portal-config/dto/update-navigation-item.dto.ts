import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNavigationItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  label?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  tooltip?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  url?: string | null;

  @IsBoolean()
  @IsOptional()
  available?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  icon?: string | null;
}
