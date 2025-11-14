import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class AddPhoneContactDto {
  @IsString()
  @Matches(/^\+\d{2,6}$/)
  dialCode!: string;

  @IsString()
  @Matches(/^[0-9\s-]{5,20}$/)
  phone!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdatePhoneContactDto {
  @IsOptional()
  @IsString()
  @Matches(/^\+\d{2,6}$/)
  dialCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9\s-]{5,20}$/)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
