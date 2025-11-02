import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateHeroBackgroundDto {
  @IsString()
  @IsOptional()
  attachmentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string | null;
}
