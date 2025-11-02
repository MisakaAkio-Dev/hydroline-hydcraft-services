import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { PortalModule } from './portal/portal.module';
import { ConfigModule } from './config/config.module';

@Module({
  imports: [PrismaModule, AuthModule, AttachmentsModule, ConfigModule, PortalModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
