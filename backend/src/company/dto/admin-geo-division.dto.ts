import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateWorldDivisionNodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^\S+$/, { message: 'id 不能包含空白字符' })
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  level!: 1 | 2 | 3;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  parentId?: string | null;
}

export class UpdateWorldDivisionNodeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  parentId?: string | null;
}


