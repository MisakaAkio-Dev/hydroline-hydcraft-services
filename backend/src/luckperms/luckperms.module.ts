import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { LuckpermsService } from './luckperms.service';
import { LuckpermsAdminController } from './luckperms.admin.controller';

@Global()
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [LuckpermsAdminController],
  providers: [LuckpermsService],
  exports: [LuckpermsService],
})
export class LuckpermsModule {}
