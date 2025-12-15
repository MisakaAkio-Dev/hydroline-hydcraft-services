import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MinecraftService } from './minecraft.service';
import { MinecraftController } from './minecraft.controller';
import { MinecraftServerService } from './minecraft-server.service';
import { MinecraftServerController } from './minecraft-server.controller';
import { MinecraftPingScheduler } from './ping.scheduler';
import {
  HydrolineBeaconPoolService,
  BeaconLibService,
} from '../lib/hydroline-beacon';
import { TransportationModule } from '../transportation/transportation.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ScheduleModule.forRoot(),
    forwardRef(() => TransportationModule),
  ],
  controllers: [MinecraftController, MinecraftServerController],
  providers: [
    MinecraftService,
    MinecraftServerService,
    MinecraftPingScheduler,
    HydrolineBeaconPoolService,
    BeaconLibService,
  ],
  exports: [
    MinecraftService,
    MinecraftServerService,
    HydrolineBeaconPoolService,
    BeaconLibService,
  ],
})
export class MinecraftModule {}
