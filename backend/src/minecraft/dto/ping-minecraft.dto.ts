import { MinecraftServerEdition } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class PingMinecraftRequestDto {
  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsEnum(MinecraftServerEdition)
  edition: MinecraftServerEdition = MinecraftServerEdition.JAVA;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(30000)
  timeout?: number;

  @IsOptional()
  @IsInt()
  @Min(47)
  @Max(1000)
  protocolVersion?: number;
}
