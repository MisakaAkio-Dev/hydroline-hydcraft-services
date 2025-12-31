import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { OptionalAuthGuard } from '../../auth/optional-auth.guard';
import { AuthGuard } from '../../auth/auth.guard';
import { OAuthFlowService } from '../services/oauth-flow.service';
import { OAuthStateService } from '../services/oauth-state.service';
import { StartOauthDto } from '../dto/start-oauth.dto';
import { buildRequestContext } from '../../auth/helpers/request-context.helper';
import { MicrosoftMinecraftService } from '../services/microsoft-minecraft.service';

@ApiTags('OAuth')
@Controller('oauth/providers')
export class OAuthPublicController {
  constructor(
    private readonly flowService: OAuthFlowService,
    private readonly microsoftMinecraft: MicrosoftMinecraftService,
    private readonly stateService: OAuthStateService,
  ) {}

  @Post(':providerKey/authorize')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Initiate OAuth flow' })
  async startAuthorize(
    @Param('providerKey') providerKey: string,
    @Body() dto: StartOauthDto,
    @Req() req: Request,
  ) {
    if (dto.mode === 'BIND' && !req.user?.id) {
      throw new BadRequestException('Binding requires authenticated user');
    }
    const result = await this.flowService.start(
      {
        providerKey,
        mode: dto.mode,
        redirectUri: dto.redirectUri,
        userId: dto.mode === 'BIND' ? req.user!.id : undefined,
        rememberMe: dto.rememberMe,
      },
      buildRequestContext(req),
    );
    return result;
  }

  @Post('microsoft/bindings/:accountId/xbox-authorize')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Initiate Xbox consent for Microsoft account' })
  async startXboxAuthorize(
    @Param('accountId') accountId: string,
    @Body() dto: StartOauthDto,
    @Req() req: Request,
  ) {
    const result = await this.flowService.start(
      {
        providerKey: 'microsoft',
        mode: 'BIND',
        redirectUri: dto.redirectUri,
        userId: req.user!.id,
        rememberMe: dto.rememberMe,
        purpose: 'XBOX',
        accountId,
      },
      buildRequestContext(req),
    );
    return result;
  }

  @Post('microsoft/bindings/:accountId/xbox-device')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Start Xbox device flow for Microsoft account' })
  async startXboxDeviceFlow(
    @Param('accountId') accountId: string,
    @Req() req: Request,
  ) {
    const device = await this.microsoftMinecraft.startXboxDeviceFlow({
      userId: req.user!.id,
      accountId,
    });
    const state = await this.stateService.createState({
      providerKey: 'microsoft',
      mode: 'BIND',
      userId: req.user!.id,
      purpose: 'XBOX_DEVICE',
      accountId,
      deviceFlow: {
        deviceCode: device.deviceCode,
        interval: device.interval,
        expiresAt: new Date(Date.now() + device.expiresIn * 1000).toISOString(),
      },
    });
    return {
      state,
      userCode: device.userCode,
      verificationUri: device.verificationUri,
      interval: device.interval,
      expiresIn: device.expiresIn,
    };
  }

  @Post('microsoft/bindings/:accountId/xbox-device/poll')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Poll Xbox device flow and store tokens' })
  async pollXboxDeviceFlow(
    @Param('accountId') accountId: string,
    @Body() body: { state: string },
    @Req() req: Request,
  ) {
    const entry = await this.stateService.peekState(body.state);
    if (!entry) {
      throw new BadRequestException('Device flow state expired');
    }
    const payload = entry.payload as Record<string, unknown>;
    const statePayload = payload as {
      userId?: string;
      accountId?: string;
      purpose?: string;
      deviceFlow?: {
        deviceCode?: string;
        interval?: number;
        expiresAt?: string;
      };
    };
    if (statePayload.purpose !== 'XBOX_DEVICE') {
      throw new BadRequestException('Invalid device flow state');
    }
    if (statePayload.userId !== req.user!.id) {
      throw new BadRequestException(
        'Device flow state does not belong to user',
      );
    }
    if (statePayload.accountId !== accountId) {
      throw new BadRequestException('Device flow state does not match account');
    }
    const deviceCode = statePayload.deviceFlow?.deviceCode;
    if (!deviceCode) {
      throw new BadRequestException('Device flow state missing device code');
    }
    const result = await this.microsoftMinecraft.pollXboxDeviceFlow({
      deviceCode,
    });
    if (!result.ok) {
      const err = result.payload.error ?? 'authorization_pending';
      const description = result.payload.error_description ?? '';
      if (err === 'authorization_pending') {
        return { status: 'PENDING' };
      }
      if (err === 'slow_down') {
        return {
          status: 'SLOW_DOWN',
          interval: result.payload.interval ?? 5,
        };
      }
      if (err === 'authorization_declined') {
        return { status: 'DECLINED', message: description };
      }
      if (err === 'expired_token') {
        return { status: 'EXPIRED', message: description };
      }
      throw new BadRequestException(
        description || `Device flow failed: ${err}`,
      );
    }
    await this.microsoftMinecraft.storeMinecraftAuthTokens({
      userId: req.user!.id,
      accountId,
      token: result.payload,
    });
    await this.stateService.storeResult(body.state, {
      success: true,
      mode: 'BIND',
      binding: { providerKey: 'microsoft', userId: req.user!.id },
    });
    return { status: 'AUTHORIZED' };
  }

  @Get(':providerKey/callback')
  @ApiOperation({ summary: 'OAuth redirect callback' })
  async handleCallback(
    @Param('providerKey') providerKey: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (error && state) {
      const redirectUri = await this.flowService.storeErrorResult({
        state,
        error,
        description: errorDescription,
      });
      const fallbackRedirect =
        redirectUri ||
        process.env.APP_PUBLIC_BASE_URL ||
        'http://localhost:3100';
      const target = new URL(fallbackRedirect);
      target.searchParams.set('provider', providerKey);
      target.searchParams.set('state', state);
      res.redirect(target.toString());
      return;
    }
    if (!code || !state) {
      throw new BadRequestException('Missing authorization response');
    }
    const result = await this.flowService.handleCallback({
      providerKey,
      state,
      code,
      context: buildRequestContext(req),
    });
    const target = new URL(
      result.redirectUri ||
        process.env.APP_PUBLIC_BASE_URL ||
        'http://localhost:3100',
    );
    target.searchParams.set('provider', providerKey);
    target.searchParams.set('state', state);
    res.redirect(target.toString());
  }

  @Get(':providerKey/result')
  @ApiOperation({ summary: 'Fetch OAuth result by state' })
  async fetchResult(@Query('state') state: string) {
    if (!state) {
      throw new BadRequestException('state is required');
    }
    const payload = await this.flowService.consumeResult(state);
    if (!payload) {
      throw new BadRequestException('Result expired or missing');
    }
    return payload;
  }

  @Delete(':providerKey/bindings/:accountId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '解除指定的 Provider 绑定' })
  async unlinkProviderBinding(
    @Param('providerKey') providerKey: string,
    @Param('accountId') accountId: string,
    @Req() req: Request,
  ) {
    await this.flowService.unlink(providerKey, req.user!.id, accountId);
    return { success: true };
  }

  @Delete(':providerKey/bindings')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '解除当前用户的 Provider 绑定' })
  async unlinkProvider(
    @Param('providerKey') providerKey: string,
    @Req() req: Request,
  ) {
    await this.flowService.unlink(providerKey, req.user!.id);
    return { success: true };
  }

  @Post(':providerKey/bindings/:accountId/sync-minecraft')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: '同步该 OAuth 账号的 Minecraft 资料（仅 Microsoft）',
  })
  async syncMinecraft(
    @Param('providerKey') providerKey: string,
    @Param('accountId') accountId: string,
    @Req() req: Request,
  ) {
    if (providerKey !== 'microsoft') {
      throw new BadRequestException('Only Microsoft accounts can be synced');
    }
    return this.microsoftMinecraft.syncForUserAccount({
      userId: req.user!.id,
      accountId,
    });
  }
}
