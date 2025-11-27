import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [AuthModule, AttachmentsModule],
  controllers: [PortalController],
})
export class PortalModule {}
