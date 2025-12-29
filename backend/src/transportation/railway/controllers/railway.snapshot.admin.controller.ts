import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransportationRailwayMod } from '@prisma/client';
import { AuthGuard } from '../../../auth/auth.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermissions } from '../../../auth/permissions.decorator';
import { PERMISSIONS } from '../../../auth/services/roles.service';
import { RailwayRouteDetailQueryDto } from '../../dto/railway.dto';
import { TransportationRailwaySnapshotService } from '../snapshot/railway-snapshot.service';

@ApiTags('交通系统 - 铁路（管理端）')
@ApiBearerAuth()
@Controller('transportation/railway/admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class TransportationRailwaySnapshotAdminController {
  constructor(
    private readonly snapshotService: TransportationRailwaySnapshotService,
  ) {}

  @Post('routes/:railwayType/:routeId/geometry')
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_FORCE_REFRESH)
  @ApiOperation({ summary: '手动重新生成单条线路路径快照' })
  async regenerateRouteGeometry(
    @Param('railwayType') railwayTypeParam: string,
    @Param('routeId') routeId: string,
    @Query() query: RailwayRouteDetailQueryDto,
  ) {
    const railwayType = parseRailwayTypeParam(railwayTypeParam);
    if (!query?.serverId) {
      throw new BadRequestException('Missing serverId');
    }
    return this.snapshotService.computeAndPersistRouteGeometrySnapshot({
      serverId: query.serverId,
      railwayMod: railwayType,
      routeId,
      dimension: query.dimension ?? null,
    });
  }

  @Get('routes/:railwayType/:routeId/geometry/rails')
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_FORCE_REFRESH)
  @ApiOperation({ summary: '分页读取线路轨道诊断列表' })
  async listRouteRailDiagnostics(
    @Param('railwayType') railwayTypeParam: string,
    @Param('routeId') routeId: string,
    @Query('jobId') jobId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('onlyErrors') onlyErrors?: string,
  ) {
    parseRailwayTypeParam(railwayTypeParam);
    if (!routeId?.trim()) {
      throw new BadRequestException('Route ID is required');
    }
    if (!jobId?.trim()) {
      throw new BadRequestException('Job ID is required');
    }
    const result = this.snapshotService.getRailDiagnosticsPage({
      jobId: jobId.trim(),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search: search ?? null,
      onlyErrors: onlyErrors === 'true',
    });
    if (result.routeId !== routeId) {
      throw new BadRequestException('Job does not match route');
    }
    return result;
  }
}

function parseRailwayTypeParam(
  value: string | undefined,
): TransportationRailwayMod {
  if (!value?.trim()) {
    throw new BadRequestException('Please select a railway category');
  }
  const normalized = value.trim().toLowerCase();
  const match = Object.values(TransportationRailwayMod).find(
    (type) => type.toLowerCase() === normalized,
  );
  if (!match) {
    throw new BadRequestException('Unrecognized railway type');
  }
  return match;
}
