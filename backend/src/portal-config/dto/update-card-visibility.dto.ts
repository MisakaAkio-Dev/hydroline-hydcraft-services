import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCardVisibilityDto {
  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  @IsOptional()
  allowGuests?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedRoles?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedUsers?: string[];
}
