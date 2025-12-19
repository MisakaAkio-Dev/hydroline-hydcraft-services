import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MinecraftModule } from '../minecraft/minecraft.module';
import { TransportationRailwayController } from './railway/controllers/railway.controller';
import { TransportationRailwayAdminController } from './railway/controllers/railway.admin.controller';
import { TransportationRailwayRouteDetailService } from './railway/route-detail/railway-route-detail.service';
import { TransportationRailwayStationMapService } from './railway/services/railway-station-map.service';
import { TransportationRailwayListService } from './railway/services/railway-list.service';
import { TransportationRailwayService } from './railway/services/railway.service';
import { TransportationRailwaySyncService } from './railway/services/railway-sync.service';
import { TransportationRailwaySnapshotService } from './railway/snapshot/railway-snapshot.service';

@Module({
  imports: [PrismaModule, AuthModule, forwardRef(() => MinecraftModule)],
  providers: [
    TransportationRailwayService,
    TransportationRailwayRouteDetailService,
    TransportationRailwayListService,
    TransportationRailwaySyncService,
    TransportationRailwayStationMapService,
    TransportationRailwaySnapshotService,
  ],
  controllers: [
    TransportationRailwayController,
    TransportationRailwayAdminController,
  ],
  exports: [TransportationRailwaySyncService],
})
export class TransportationModule {}
