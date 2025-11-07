import {
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
import { UsersService } from './users.service';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { DEFAULT_PERMISSIONS } from './roles.service';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { CreateMinecraftProfileDto } from './dto/create-minecraft-profile.dto';
import { UpdateMinecraftProfileDto } from './dto/update-minecraft-profile.dto';
import { CreateStatusEventDto } from './dto/create-status-event.dto';
import { CreateLifecycleEventDto } from './dto/create-lifecycle-event.dto';
import { CreateUserContactDto } from './dto/create-user-contact.dto';
import { UpdateUserContactDto } from './dto/update-user-contact.dto';
import { RegeneratePiicDto } from './dto/regenerate-piic.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { UpdateJoinDateDto } from './dto/update-join-date.dto';

@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('auth/users')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_USERS)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: '分页查询用户' })
  async list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.usersService.listUsers({
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':userId')
  @ApiOperation({ summary: '获取用户详情' })
  async detail(@Param('userId') userId: string) {
    return this.usersService.getUserDetail(userId);
  }

  @Patch(':userId/profile')
  @ApiOperation({ summary: '更新用户档案' })
  async updateProfile(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  // Update user's in-game join date (admin only). Registration time is immutable.
  @Patch(':userId/join-date')
  @ApiOperation({ summary: '调整入服日期' })
  async updateJoinDate(
    @Param('userId') userId: string,
    @Body() dto: UpdateJoinDateDto,
  ) {
    return this.usersService.updateJoinDate(userId, dto.joinDate);
  }

  @Post(':userId/minecraft-profiles')
  @ApiOperation({ summary: '新增玩家昵称或别名记录' })
  async addMinecraftProfile(
    @Param('userId') userId: string,
    @Body() dto: CreateMinecraftProfileDto,
  ) {
    return this.usersService.addMinecraftProfile(userId, dto);
  }

  @Patch(':userId/minecraft-profiles/:profileId')
  @ApiOperation({ summary: '更新玩家昵称或别名记录' })
  async updateMinecraftProfile(
    @Param('userId') userId: string,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateMinecraftProfileDto,
  ) {
    return this.usersService.updateMinecraftProfile(userId, profileId, dto);
  }

  @Delete(':userId/minecraft-profiles/:profileId')
  @ApiOperation({ summary: '删除玩家昵称或别名记录' })
  async removeMinecraftProfile(
    @Param('userId') userId: string,
    @Param('profileId') profileId: string,
  ) {
    await this.usersService.removeMinecraftProfile(userId, profileId);
    return { success: true };
  }

  @Post(':userId/status-events')
  @ApiOperation({ summary: '新增状态事件' })
  async addStatusEvent(
    @Param('userId') userId: string,
    @Body() dto: CreateStatusEventDto,
    @Req() req: Request,
  ) {
    return this.usersService.addStatusEvent(userId, dto, req.user?.id);
  }

  @Post(':userId/lifecycle-events')
  @ApiOperation({ summary: '新增生命周期事件' })
  async addLifecycleEvent(
    @Param('userId') userId: string,
    @Body() dto: CreateLifecycleEventDto,
    @Req() req: Request,
  ) {
    return this.usersService.addLifecycleEvent(userId, dto, req.user?.id);
  }

  @Post(':userId/contacts')
  @ApiOperation({ summary: '新增联系信息' })
  async addContact(
    @Param('userId') userId: string,
    @Body() dto: CreateUserContactDto,
  ) {
    return this.usersService.addContact(userId, dto);
  }

  @Patch(':userId/contacts/:contactId')
  @ApiOperation({ summary: '更新联系信息' })
  async updateContact(
    @Param('userId') userId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateUserContactDto,
  ) {
    return this.usersService.updateContact(userId, contactId, dto);
  }

  @Delete(':userId/contacts/:contactId')
  @ApiOperation({ summary: '删除联系信息' })
  async removeContact(
    @Param('userId') userId: string,
    @Param('contactId') contactId: string,
  ) {
    await this.usersService.removeContact(userId, contactId);
    return { success: true };
  }

  @Post(':userId/piic/regenerate')
  @ApiOperation({ summary: '重新生成 PIIC' })
  async regeneratePiic(
    @Param('userId') userId: string,
    @Body() dto: RegeneratePiicDto,
    @Req() req: Request,
  ) {
    return this.usersService.regeneratePiic(userId, dto, req.user?.id);
  }

  @Post(':userId/roles')
  @ApiOperation({ summary: '分配角色' })
  async assignRoles(
    @Param('userId') userId: string,
    @Body() dto: AssignRolesDto,
    @Req() req: Request,
  ) {
    return this.usersService.assignRoles(userId, dto.roleKeys, req.user?.id);
  }
}
