import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/services/roles.service';
import { PortalConfigService } from './portal-config.service';
import { UpdateHeroSubtitleDto } from './dto/update-hero-subtitle.dto';
import { CreateHeroBackgroundDto } from './dto/create-hero-background.dto';
import { UpdateHeroBackgroundDto } from './dto/update-hero-background.dto';
import { ReorderHeroBackgroundsDto } from './dto/reorder-hero-backgrounds.dto';
import { CreateNavigationItemDto } from './dto/create-navigation-item.dto';
import { UpdateNavigationItemDto } from './dto/update-navigation-item.dto';
import { ReorderNavigationDto } from './dto/reorder-navigation.dto';
import { UpdateCardVisibilityDto } from './dto/update-card-visibility.dto';

@ApiTags('门户配置')
@ApiBearerAuth()
@Controller('admin/portal/config')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_PORTAL_HOME)
export class PortalConfigController {
  constructor(private readonly portalConfigService: PortalConfigService) {}

  @Get()
  @ApiOperation({ summary: '获取门户配置草稿' })
  async getConfig() {
    return this.portalConfigService.getAdminConfig();
  }

  @Patch('hero')
  @ApiOperation({ summary: '更新英雄区副标题' })
  async updateHeroSubtitle(
    @Body() dto: UpdateHeroSubtitleDto,
    @Req() req: Request,
  ) {
    return this.portalConfigService.updateHeroSubtitle(dto.subtitle, {
      userId: req.user!.id,
    });
  }

  @Post('hero/backgrounds')
  @ApiOperation({ summary: '新增英雄区背景' })
  async addHeroBackground(
    @Body() dto: CreateHeroBackgroundDto,
    @Req() req: Request,
  ) {
    return this.portalConfigService.addHeroBackground(dto, {
      userId: req.user!.id,
    });
  }

  @Patch('hero/backgrounds/:backgroundId')
  @ApiOperation({ summary: '更新英雄区背景' })
  async updateHeroBackground(
    @Param('backgroundId') backgroundId: string,
    @Body() dto: UpdateHeroBackgroundDto,
    @Req() req: Request,
  ) {
    return this.portalConfigService.updateHeroBackground(backgroundId, dto, {
      userId: req.user!.id,
    });
  }

  @Delete('hero/backgrounds/:backgroundId')
  @ApiOperation({ summary: '删除英雄区背景' })
  async removeHeroBackground(
    @Param('backgroundId') backgroundId: string,
    @Req() req: Request,
  ) {
    return this.portalConfigService.removeHeroBackground(backgroundId, {
      userId: req.user!.id,
    });
  }

  @Patch('hero/backgrounds/reorder')
  @ApiOperation({ summary: '调整英雄区背景排序' })
  async reorderHeroBackgrounds(
    @Body() dto: ReorderHeroBackgroundsDto,
    @Req() req: Request,
  ) {
    return this.portalConfigService.reorderHeroBackgrounds(dto.order, {
      userId: req.user!.id,
    });
  }

  @Post('navigation')
  @ApiOperation({ summary: '创建导航链接' })
  async createNavigationItem(
    @Body() dto: CreateNavigationItemDto,
    @Req() req: Request,
  ) {
    return this.portalConfigService.createNavigationItem(dto, {
      userId: req.user!.id,
    });
  }

  @Patch('navigation/:navigationId')
  @ApiOperation({ summary: '更新导航链接' })
  async updateNavigationItem(
    @Param('navigationId') navigationId: string,
    @Body() dto: UpdateNavigationItemDto,
    @Req() req: Request,
  ) {
    const payload = {
      label: dto.label ?? undefined,
      tooltip: dto.tooltip ?? undefined,
      url: dto.url ?? undefined,
      available: dto.available,
      icon: dto.icon ?? undefined,
    };
    return this.portalConfigService.updateNavigationItem(
      navigationId,
      payload,
      {
        userId: req.user!.id,
      },
    );
  }

  @Delete('navigation/:navigationId')
  @ApiOperation({ summary: '删除导航链接' })
  async removeNavigationItem(
    @Param('navigationId') navigationId: string,
    @Req() req: Request,
  ) {
    return this.portalConfigService.removeNavigationItem(navigationId, {
      userId: req.user!.id,
    });
  }

  @Patch('navigation/reorder')
  @ApiOperation({ summary: '重新排序导航' })
  async reorderNavigation(
    @Body() dto: ReorderNavigationDto,
    @Req() req: Request,
  ) {
    return this.portalConfigService.reorderNavigation(dto.order, {
      userId: req.user!.id,
    });
  }

  @Patch('cards/:cardId')
  @ApiOperation({ summary: '更新门户卡片可见性' })
  async updateCardVisibility(
    @Param('cardId') cardId: string,
    @Body() dto: UpdateCardVisibilityDto,
    @Req() req: Request,
  ) {
    return this.portalConfigService.updateCardVisibility(
      cardId,
      {
        enabled: dto.enabled,
        allowGuests: dto.allowGuests ?? false,
        allowedRoles: dto.allowedRoles ?? [],
        allowedUsers: dto.allowedUsers ?? [],
      },
      {
        userId: req.user!.id,
      },
    );
  }
}
