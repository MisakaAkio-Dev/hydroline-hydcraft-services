import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthGuard } from './auth.guard';
import { buildRequestContext } from './helpers/request-context.helper';
import { IpLocationService } from '../lib/ip2region/ip-location.service';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly ipLocationService: IpLocationService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: '邮箱注册' })
  async signUp(
    @Body() dto: SignUpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signUp(dto, buildRequestContext(req));
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('signin')
  @ApiOperation({ summary: '邮箱登录' })
  async signIn(
    @Body() dto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signIn(dto, buildRequestContext(req));
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: '刷新访问令牌' })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refresh(dto);
    this.attachCookies(res, result.cookies);
    return {
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
      user: result.user,
    };
  }

  @Post('signout')
  @ApiOperation({ summary: '退出登录' })
  async signOut(@Req() req: Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const token = authHeader.slice(7);
    return this.authService.signOut(token);
  }

  @Get('session')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前会话用户' })
  getSession(@Req() req: Request) {
    return {
      user: req.user,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户资料' })
  async getCurrentUser(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.getSessionUser(userId);
    const enrichedBindings = await this.enrichAuthmeBindings(
      (user as Record<string, unknown>)?.['authmeBindings'],
    );
    if (enrichedBindings) {
      return {
        user: {
          ...user,
          authmeBindings: enrichedBindings,
        },
      };
    }
    return { user };
  }

  // split: basic profile only
  @Get('me/basic')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户基础资料' })
  async getCurrentUserBasic(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.getSessionUser(userId);
    // pick basic fields only
    const picked = {
      id: (user as any)?.id ?? null,
      name: (user as any)?.name ?? null,
      email: (user as any)?.email ?? null,
      profile: (user as any)?.profile ?? null,
      createdAt: (user as any)?.createdAt ?? null,
      updatedAt: (user as any)?.updatedAt ?? null,
      lastLoginAt: (user as any)?.lastLoginAt ?? null,
      lastLoginIp: (user as any)?.lastLoginIp ?? null,
      lastLoginIpLocation: (user as any)?.lastLoginIpLocation ?? (user as any)?.lastLoginIpLocationRaw ?? null,
    };
    return { user: picked };
  }

  @Patch('me/basic')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新当前用户基础资料' })
  async updateCurrentUserBasic(
    @Req() req: Request,
    @Body() dto: UpdateCurrentUserDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.updateCurrentUser(userId, dto);
    return { user };
  }

  // split: minecraft bindings + luckperms
  @Get('me/minecraft')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户的 AuthMe 与 LuckPerms 数据' })
  async getCurrentUserMinecraft(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.getSessionUser(userId);
    const enrichedBindings = await this.enrichAuthmeBindings(
      (user as Record<string, unknown>)?.['authmeBindings'],
    );
    return {
      user: {
        id: (user as any)?.id ?? null,
        updatedAt: (user as any)?.updatedAt ?? null,
        authmeBindings: enrichedBindings ?? null,
        luckperms: (user as any)?.luckperms ?? undefined,
      },
    };
  }

  // split: sessions only (same shape as GET /auth/sessions)
  @Get('me/sessions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户会话列表' })
  async getCurrentUserSessions(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    try {
      await this.authService.touchSession(
        req.sessionToken as string,
        buildRequestContext(req),
      );
    } catch {}
    const sessions = await this.authService.listUserSessions(userId);
    const currentToken = req.sessionToken ?? null;
    const enriched = await Promise.all(
      sessions.map(async (session) => ({
        session,
        location: await this.ipLocationService.lookup(session.ipAddress),
      })),
    );
    return {
      sessions: enriched.map(({ session, location }) => ({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        ipLocation: location?.display ?? null,
        userAgent: session.userAgent,
        isCurrent: session.token === currentToken,
      })),
    };
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '列出会话记录' })
  async listSessions(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    // Best-effort: update current session IP/UA from this request
    try {
      await this.authService.touchSession(
        req.sessionToken as string,
        buildRequestContext(req),
      );
    } catch {
      // ignore
    }
    const sessions = await this.authService.listUserSessions(userId);
    const currentToken = req.sessionToken ?? null;
    const enriched = await Promise.all(
      sessions.map(async (session) => ({
        session,
        location: await this.ipLocationService.lookup(session.ipAddress),
      })),
    );
    return {
      sessions: enriched.map(({ session, location }) => ({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        ipLocation: location?.display ?? null,
        userAgent: session.userAgent,
        isCurrent: session.token === currentToken,
      })),
    };
  }

  @Post('sessions/identify')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '标记会话设备信息' })
  async identifySession(
    @Req() req: Request,
    @Body()
    body: { deviceName?: string | null; devicePlatform?: string | null },
  ) {
    const token: string | undefined = req.sessionToken ?? undefined;
    if (!token) {
      throw new UnauthorizedException('Invalid session');
    }
    const result = await this.authService.identifySession(
      token,
      body ?? {},
      buildRequestContext(req),
    );
    return result;
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '撤销指定会话' })
  async revokeSession(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const removed = await this.authService.removeUserSession(userId, sessionId);
    const current = removed.token === req.sessionToken;
    return {
      success: true,
      current,
    };
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新当前用户资料' })
  async updateCurrentUser(
    @Req() req: Request,
    @Body() dto: UpdateCurrentUserDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.usersService.updateCurrentUser(userId, dto);
    return { user };
  }

  private attachCookies(res: Response, cookies: string[]) {
    if (!cookies || cookies.length === 0) {
      return;
    }
    cookies.forEach((cookie) => {
      res.append('Set-Cookie', cookie);
    });
  }

  private async enrichAuthmeBindings(bindings: unknown) {
    if (!Array.isArray(bindings) || bindings.length === 0) {
      return null;
    }

    const normalized = bindings
      .map((entry) =>
        entry && typeof entry === 'object'
          ? (entry as Record<string, unknown>)
          : null,
      )
      .filter((entry): entry is Record<string, unknown> => entry !== null);

    if (normalized.length === 0) {
      return null;
    }

    return Promise.all(
      normalized.map(async (binding) => {
        const [ipLocation, regipLocation] = await Promise.all([
          this.ipLocationService.lookup(
            (binding['ip'] as string | null | undefined) ?? null,
          ),
          this.ipLocationService.lookup(
            (binding['regip'] as string | null | undefined) ?? null,
          ),
        ]);
        return {
          ...binding,
          ip_location: ipLocation?.raw ?? null,
          ip_location_display: ipLocation?.display ?? null,
          regip_location: regipLocation?.raw ?? null,
          regip_location_display: regipLocation?.display ?? null,
        };
      }),
    );
  }
}
