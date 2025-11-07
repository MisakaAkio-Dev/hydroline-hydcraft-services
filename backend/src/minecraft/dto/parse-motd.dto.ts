import { IsBoolean, IsOptional } from 'class-validator';

export class ParseMotdDto {
  motd!: unknown;

  @IsOptional()
  @IsBoolean()
  bedrock?: boolean;
}
