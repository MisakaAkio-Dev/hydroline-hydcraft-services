import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../../../auth/auth.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermissions } from '../../../auth/permissions.decorator';
import { PERMISSIONS } from '../../../auth/services/roles.service';
import {
  CreateRailwayFeaturedItemDto,
  ReorderRailwayFeaturedItemsDto,
  UpdateRailwayRouteDto,
} from '../../dto/railway.dto';
import { TransportationRailwayService } from '../services/railway.service';
import { TransportationRailwayMod } from '@prisma/client';

@ApiTags('交通系统 - 铁路（管理端）')
@ApiBearerAuth()
@Controller('transportation/railway/admin')
// @UseGuards(AuthGuard, PermissionsGuard)
export class TransportationRailwayAdminController {
  constructor(
    private readonly transportationRailwayService: TransportationRailwayService,
  ) {}

  private getUserId(req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return userId;
  }

  @Get('featured')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_FEATURED)
  @ApiOperation({ summary: '查看铁路首页设施推荐配置' })
  async list() {
    return this.transportationRailwayService.adminListFeaturedItems();
  }

  @Post('featured')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_FEATURED)
  @ApiOperation({ summary: '新增铁路首页设施推荐' })
  async create(@Body() dto: CreateRailwayFeaturedItemDto, @Req() req: Request) {
    const userId = this.getUserId(req);
    return this.transportationRailwayService.createFeaturedItem(userId, dto);
  }

  @Delete('featured/:featuredId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_FEATURED)
  @ApiOperation({ summary: '删除铁路首页设施推荐' })
  async delete(@Param('featuredId') featuredId: string) {
    return this.transportationRailwayService.deleteFeaturedItem(featuredId);
  }

  @Patch('featured/order')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_FEATURED)
  @ApiOperation({ summary: '重新排序铁路设施推荐' })
  async reorder(@Body() dto: ReorderRailwayFeaturedItemsDto) {
    return this.transportationRailwayService.reorderFeaturedItems(dto.ids);
  }

  @Patch('routes/:railwayType/:routeId')
  @UseGuards(AuthGuard)
  // @RequirePermissions(PERMISSIONS.TRANSPORTATION_RAILWAY_MANAGE_FEATURED)
  @ApiOperation({ summary: '更新线路信息（名称/颜色）' })
  async updateRoute(
    @Param('railwayType') railwayType: string,
    @Param('routeId') routeId: string,
    @Body() dto: UpdateRailwayRouteDto,
    @Query('serverId') serverId: string,
  ) {
    if (!serverId) {
      throw new BadRequestException('Missing serverId');
    }
    const mod = Object.values(TransportationRailwayMod).find(
      (m) => m.toLowerCase() === railwayType.toLowerCase(),
    );
    if (!mod) {
      throw new BadRequestException('Invalid railway type');
    }

    return this.transportationRailwayService.updateRoute(
      serverId,
      mod,
      routeId,
      dto,
    );
  }
}
