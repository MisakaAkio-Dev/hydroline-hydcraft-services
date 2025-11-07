import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ValidatePlayerNameDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(16)
  name!: string;
}
