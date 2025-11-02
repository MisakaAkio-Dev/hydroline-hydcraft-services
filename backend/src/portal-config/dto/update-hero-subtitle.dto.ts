import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateHeroSubtitleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  subtitle!: string;
}
