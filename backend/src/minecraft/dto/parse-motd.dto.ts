import { Allow, IsBoolean, IsOptional } from 'class-validator';

export class ParseMotdDto {
  // 使用 @Allow() 以在全局 whitelist 下允许任意类型的 motd 字段
  @Allow()
  motd!: unknown;

  @IsOptional()
  @IsBoolean()
  bedrock?: boolean;
}
