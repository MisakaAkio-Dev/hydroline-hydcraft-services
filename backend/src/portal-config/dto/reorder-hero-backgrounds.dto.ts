import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReorderHeroBackgroundsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  order!: string[];
}
