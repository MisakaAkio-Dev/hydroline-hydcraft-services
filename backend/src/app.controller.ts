import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { AuthGuard } from './auth/auth.guard';

@ApiTags('系统')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: '获取服务运行状态' })
  getHello(): string {
    return this.appService.getHello();
  }

  @UseGuards(AuthGuard)
  @Get('protected')
  @ApiBearerAuth()
  @ApiOperation({ summary: '示例受保护接口' })
  getProtected(@Request() req: any) {
    return {
      message: 'This is a protected route',
      user: req.user,
    };
  }
}
