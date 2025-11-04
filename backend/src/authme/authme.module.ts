import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthmeService } from './authme.service';
import { AuthmeBindingService } from './authme-binding.service';
import { AuthFeatureService } from './auth-feature.service';
import { AuthmeRateLimitGuard } from './authme-rate-limit.guard';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [AuthmeService, AuthmeBindingService, AuthFeatureService, AuthmeRateLimitGuard],
  exports: [AuthmeService, AuthmeBindingService, AuthFeatureService, AuthmeRateLimitGuard],
})
export class AuthmeModule {}
