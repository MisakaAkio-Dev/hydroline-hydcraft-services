import { IsNotEmpty, IsString } from 'class-validator';

export class SetPrimaryAuthmeBindingDto {
  // 历史数据中可能存在非 UUID（如 CUID）的绑定主键，因此放宽为非空字符串
  @IsString()
  @IsNotEmpty()
  bindingId!: string;
}
