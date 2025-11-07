import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MinecraftService } from './minecraft.service';
import { MinecraftController } from './minecraft.controller';
import { MinecraftServerService } from './minecraft-server.service';
import { MinecraftServerController } from './minecraft-server.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MinecraftController, MinecraftServerController],
  providers: [MinecraftService, MinecraftServerService],
  exports: [MinecraftService, MinecraftServerService],
})
export class MinecraftModule {}
