import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { toJsonValue } from '../utils/json-transform';

export class UpdateConfigEntryDto {
  @IsOptional()
  @Transform(({ value }) => toJsonValue(value))
  value?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
