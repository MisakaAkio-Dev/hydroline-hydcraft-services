import { Module } from '@nestjs/common';
import { PortalConfigController } from './portal-config.controller';
import { PortalConfigService } from './portal-config.service';
import { ConfigModule } from '../config/config.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, AttachmentsModule, AuthModule],
  controllers: [PortalConfigController],
  providers: [PortalConfigService],
  exports: [PortalConfigService],
})
export class PortalConfigModule {}
