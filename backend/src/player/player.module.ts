import { Module, forwardRef } from '@nestjs/common';
import { PlayerController } from './player.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerService } from './player.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Ip2RegionModule } from '../lib/ip2region/ip2region.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthmeModule } from '../authme/authme.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    Ip2RegionModule,
    AttachmentsModule,
    AuthmeModule,
  ],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
