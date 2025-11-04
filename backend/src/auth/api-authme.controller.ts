import {
  Body,
  Controller,
  Delete,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthmeBindDto } from './dto/authme-bind.dto';
import { rethrowAuthmeError } from './helpers/authme-error.helper';
import { AuthmeRateLimitGuard } from '../authme/authme-rate-limit.guard';

@Controller('api/authme')
export class ApiAuthmeController {
  constructor(private readonly authService: AuthService) {}

  @Post('bind')
  @UseGuards(AuthGuard, AuthmeRateLimitGuard)
  async bind(@Body() dto: AuthmeBindDto, @Req() req: Request) {
    try {
      const user = await this.authService.bindAuthme(
        req.user!.id,
        dto,
        buildRequestContext(req),
      );
      return user;
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }

  @Delete('bind')
  @UseGuards(AuthGuard, AuthmeRateLimitGuard)
  async unbind(@Req() req: Request, @Query('username') username?: string) {
    try {
      const user = await this.authService.unbindAuthme(
        req.user!.id,
        buildRequestContext(req),
        username,
      );
      return user;
    } catch (error) {
      rethrowAuthmeError(error);
    }
  }
}

function buildRequestContext(req: Request) {
  return {
    ip:
      req.ip ??
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim(),
    userAgent: req.headers['user-agent'] ?? null,
  };
}
