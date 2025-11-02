import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHeroBackgroundDto {
  @IsString()
  @IsNotEmpty()
  attachmentId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string | null;
}
