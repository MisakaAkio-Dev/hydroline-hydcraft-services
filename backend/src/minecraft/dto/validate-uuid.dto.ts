import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateUuidDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(36)
  value!: string;
}
