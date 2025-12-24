import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../../../auth/auth.guard';
import {
  RailwayCompanyBindingQueryDto,
  RailwayCompanyBindingUpdateDto,
} from '../../dto/railway-binding.dto';
import { TransportationRailwayCompanyBindingService } from '../services/railway-company-binding.service';

@ApiTags('交通系统 - 铁路绑定')
@Controller('transportation/railway/bindings')
export class TransportationRailwayBindingController {
  constructor(
    private readonly bindingService: TransportationRailwayCompanyBindingService,
  ) {}

  private requireUserId(req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User session has expired');
    }
    return userId;
  }

  @Get()
  @ApiOperation({ summary: '获取铁路设施绑定的公司信息' })
  async getBindings(@Query() query: RailwayCompanyBindingQueryDto) {
    return this.bindingService.getBindings(query);
  }

  @Patch()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新铁路设施绑定的公司信息' })
  async updateBindings(
    @Req() req: Request,
    @Body() body: RailwayCompanyBindingUpdateDto,
  ) {
    const userId = this.requireUserId(req);
    return this.bindingService.updateBindings(
      userId,
      body,
      body.operatorCompanyIds ?? [],
      body.builderCompanyIds ?? [],
    );
  }
}
