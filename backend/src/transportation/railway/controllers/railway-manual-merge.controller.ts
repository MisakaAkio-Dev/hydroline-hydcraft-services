import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../../../auth/auth.guard';
import { TransportationRailwayManualMergeService } from '../services/railway-manual-merge.service';
import { RailwayManualMergeCreateDto } from '../../dto/railway-manual-merge.dto';
import { TransportationRailwayManualMergeEntityType } from '@prisma/client';
import { OptionalAuthGuard } from '../../../auth/optional-auth.guard';

@ApiTags('交通系统 - 铁路手动合并')
@Controller('transportation/railway/merges')
export class TransportationRailwayManualMergeController {
  constructor(
    private readonly mergeService: TransportationRailwayManualMergeService,
  ) {}

  private requireUser(req: Request) {
    const user = req.user;
    if (!user) {
      throw new BadRequestException('User session has expired');
    }
    return user;
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建手动合并实体（线路/车站/车厂）' })
  async create(@Req() req: Request, @Body() body: RailwayManualMergeCreateDto) {
    const user = this.requireUser(req);
    return this.mergeService.createMerge(user, body);
  }

  @Get('routes/:id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取合并线路详情（uuid）' })
  async getMergedRoute(@Param('id') id: string, @Req() req: Request) {
    return this.mergeService.getMergedRouteDetail(id, req.user);
  }

  @Get('stations/:id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取合并车站详情（uuid）' })
  async getMergedStation(@Param('id') id: string, @Req() req: Request) {
    return this.mergeService.getMergedEntityDetail(
      TransportationRailwayManualMergeEntityType.STATION,
      id,
      req.user,
    );
  }

  @Get('depots/:id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取合并车厂详情（uuid）' })
  async getMergedDepot(@Param('id') id: string, @Req() req: Request) {
    return this.mergeService.getMergedEntityDetail(
      TransportationRailwayManualMergeEntityType.DEPOT,
      id,
      req.user,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除手动合并实体' })
  async delete(@Param('id') id: string, @Req() req: Request) {
    const user = this.requireUser(req);
    return this.mergeService.deleteMerge(user, id);
  }
}
