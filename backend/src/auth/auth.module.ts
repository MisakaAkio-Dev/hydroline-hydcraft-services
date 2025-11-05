import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { ContactChannelsService } from './contact-channels.service';
import { ContactChannelsController } from './contact-channels.controller';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { AuthBootstrap } from './auth.bootstrap';
import { OptionalAuthGuard } from './optional-auth.guard';
import { ApiAuthController } from './api-auth.controller';
import { ApiAuthmeController } from './api-authme.controller';
import { Ip2RegionModule } from '../lib/ip2region/ip2region.module';

@Module({
  imports: [Ip2RegionModule],
  controllers: [
    AuthController,
    ApiAuthController,
    ApiAuthmeController,
    UsersController,
    RolesController,
    ContactChannelsController,
  ],
  providers: [
    AuthService,
    UsersService,
    RolesService,
    ContactChannelsService,
    AuthGuard,
    PermissionsGuard,
    OptionalAuthGuard,
    AuthBootstrap,
  ],
  exports: [AuthService, AuthGuard, OptionalAuthGuard, PermissionsGuard],
})
export class AuthModule {}
