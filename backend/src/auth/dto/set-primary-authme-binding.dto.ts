import { IsUUID } from 'class-validator';

export class SetPrimaryAuthmeBindingDto {
  @IsUUID()
  bindingId!: string;
}
