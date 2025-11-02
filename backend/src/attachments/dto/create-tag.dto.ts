import { IsOptional, IsString } from 'class-validator';

export class CreateTagDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
