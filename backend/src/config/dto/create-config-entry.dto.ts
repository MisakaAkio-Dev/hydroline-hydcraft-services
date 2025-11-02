import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { toJsonValue } from '../utils/json-transform';

export class CreateConfigEntryDto {
  @IsString()
  @Matches(/^[a-z0-9._-]+$/)
  @MaxLength(64)
  key!: string;

  @Transform(({ value }) => toJsonValue(value))
  value!: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
