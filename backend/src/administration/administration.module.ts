/**
 * Administration module wiring for regimes, division types, and divisions.
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdministrationService } from './administration.service';
import { AdministrationAdminController } from './controllers/administration-admin.controller';
import { AdministrationPublicController } from './controllers/administration-public.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [AdministrationService],
  controllers: [AdministrationAdminController, AdministrationPublicController],
  exports: [AdministrationService],
})
export class AdministrationModule {}
