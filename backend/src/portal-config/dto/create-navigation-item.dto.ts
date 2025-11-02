import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateNavigationItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;

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
