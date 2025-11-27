import { Module, forwardRef } from '@nestjs/common';
import { PlayerController } from './player.controller';
import { PortalModule } from '../portal/portal.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PortalModule, forwardRef(() => AuthModule)],
  controllers: [PlayerController],
})
export class PlayerModule {}
