import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// 管理员直接创建 AuthMe 绑定 DTO
// identifier: 可以是 AuthMe 的 username 或 realname（前端统一按 realname 展示）
// setPrimary: 是否在创建后立即设为主绑定
export class CreateAuthmeBindingAdminDto {
  @IsString()
  @MaxLength(64)
  identifier!: string;

  @IsOptional()
  @IsBoolean()
  setPrimary?: boolean;
}
