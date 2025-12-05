import { IsOptional, IsUUID } from 'class-validator';

export class RankLeadersQueryDto {
  @IsOptional()
  @IsUUID()
  serverId?: string;
}
