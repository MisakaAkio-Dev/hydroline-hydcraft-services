import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { DEFAULT_PERMISSIONS, RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@ApiTags('角色与权限')
@ApiBearerAuth()
@Controller('auth')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_ROLES)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('roles')
  @ApiOperation({ summary: '列出角色' })
  async listRoles() {
    return this.rolesService.listRoles();
  }

  @Post('roles')
  @ApiOperation({ summary: '创建角色' })
  async createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Patch('roles/:roleId')
  @ApiOperation({ summary: '更新角色' })
  async updateRole(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(roleId, dto);
  }

  @Patch('roles/:roleId/permissions')
  @ApiOperation({ summary: '更新角色权限' })
  async updateRolePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rolesService.updateRolePermissions(roleId, dto);
  }

  @Delete('roles/:roleId')
  @ApiOperation({ summary: '删除角色' })
  async deleteRole(@Param('roleId') roleId: string) {
    await this.rolesService.deleteRole(roleId);
    return { success: true };
  }

  @Get('permissions')
  @ApiOperation({ summary: '列出权限点' })
  async listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Post('permissions')
  @ApiOperation({ summary: '创建权限点' })
  async createPermission(@Body() dto: CreatePermissionDto) {
    return this.rolesService.createPermission(dto);
  }

  @Patch('permissions/:permissionId')
  @ApiOperation({ summary: '更新权限点' })
  async updatePermission(
    @Param('permissionId') permissionId: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.rolesService.updatePermission(permissionId, dto);
  }

  @Delete('permissions/:permissionId')
  @ApiOperation({ summary: '删除权限点' })
  async deletePermission(@Param('permissionId') permissionId: string) {
    await this.rolesService.deletePermission(permissionId);
    return { success: true };
  }
}
