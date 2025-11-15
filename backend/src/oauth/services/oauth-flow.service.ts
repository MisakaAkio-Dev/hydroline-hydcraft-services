import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuthLogAction, OAuthLogStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthProvidersService } from './oauth-providers.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthLogService } from './oauth-log.service';
import {
  OAuthFlowMode,
  OAuthProviderSettings,
  OAuthResultPayload,
  OAuthStatePayload,
} from '../types/provider.types';
import { AuthService, RequestContext } from '../../auth/services/auth.service';
import { generateRandomString } from 'better-auth/crypto';

interface StartFlowInput {
  providerKey: string;
  mode: OAuthFlowMode;
  redirectUri: string;
  userId?: string;
  rememberMe?: boolean;
}

@Injectable()
export class OAuthFlowService {
  private readonly logger = new Logger(OAuthFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: OAuthProvidersService,
    private readonly stateService: OAuthStateService,
    private readonly logService: OAuthLogService,
    private readonly authService: AuthService,
  ) {}

  async start(input: StartFlowInput, context: RequestContext) {
    const runtime = await this.providers.requireRuntimeProvider(
      input.providerKey,
    );
    const state = await this.stateService.createState({
      providerKey: runtime.provider.key,
      mode: input.mode,
      redirectUri: input.redirectUri,
      userId: input.userId,
      rememberMe: input.rememberMe,
    });

    const authorizeUrl = this.buildAuthorizeUrl(
      runtime.settings,
      runtime.provider.key,
      state,
    );

    await this.logService.record({
      providerId: runtime.provider.id,
      providerKey: runtime.provider.key,
      providerType: runtime.provider.type,
      action: OAuthLogAction.AUTHORIZE,
      status: OAuthLogStatus.SUCCESS,
      userId: input.userId ?? null,
      message: `Start ${input.mode} flow`,
      metadata: { redirectUri: input.redirectUri },
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });

    return { authorizeUrl, state };
  }

  private buildAuthorizeUrl(
    settings: OAuthProviderSettings,
    providerKey: string,
    state: string,
  ) {
    const tenant = (settings.tenantId as string) || 'common';
    const baseAuthorize =
      (settings.authorizeUrl as string) ||
      'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize';
    const redirectUri = this.resolveRedirectUri(settings, providerKey);
    const scopes = Array.isArray(settings.scopes)
      ? settings.scopes
      : ['openid', 'profile', 'email', 'offline_access', 'User.Read'];
    const authorizeUrl = baseAuthorize.replace('{tenant}', tenant);
    const params = new URLSearchParams({
      client_id: (settings.clientId as string) ?? '',
      response_type: 'code',
      response_mode: 'query',
      scope: scopes.join(' '),
      redirect_uri: redirectUri,
      state,
      prompt: 'select_account',
    });
    return `${authorizeUrl}?${params.toString()}`;
  }

  private resolveRedirectUri(settings: OAuthProviderSettings, providerKey: string) {
    const base =
      (settings.redirectUri as string) ||
      `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/oauth/providers/{provider}/callback`;
    return base.replace('{provider}', providerKey);
  }

  async handleCallback(input: {
    providerKey: string;
    state: string;
    code: string;
    context: RequestContext;
  }) {
    const runtime = await this.providers.requireRuntimeProvider(
      input.providerKey,
    );
    const statePayload = await this.stateService.consumeState(input.state);
    if (!statePayload) {
      throw new BadRequestException('Invalid or expired state');
    }

    const token = await this.exchangeToken(
      runtime.settings,
      input.code,
      input.providerKey,
    );
    const profile = await this.fetchMicrosoftProfile(
      token.access_token,
      runtime.settings,
    );

    const resultPayload =
      statePayload.mode === 'BIND'
        ? await this.handleBinding(runtime.provider, statePayload, profile)
        : await this.handleLogin(
            runtime.provider,
            statePayload,
            profile,
            input.context,
          );

    await this.stateService.storeResult(input.state, resultPayload);
    return {
      redirectUri: statePayload.redirectUri,
      result: resultPayload,
    };
  }

  async consumeResult(state: string) {
    return this.stateService.consumeResult(state);
  }

  async unlink(providerKey: string, userId: string) {
    const account = await this.prisma.account.findFirst({
      where: { provider: providerKey, userId },
    });
    if (!account) {
      throw new BadRequestException('当前未绑定该 Provider');
    }
    await this.prisma.account.delete({ where: { id: account.id } });
    await this.logService.record({
      providerKey,
      providerType: account.providerId,
      action: OAuthLogAction.UNBIND,
      status: OAuthLogStatus.SUCCESS,
      userId,
      accountId: account.id,
      message: 'User removed OAuth binding',
    });
    return true;
  }

  private async exchangeToken(
    settings: OAuthProviderSettings,
    code: string,
    providerKey: string,
  ) {
    const tenant = (settings.tenantId as string) || 'common';
    const tokenUrl =
      (settings.tokenUrl as string) ||
      'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';
    const redirectUri = this.resolveRedirectUri(settings, providerKey);
    const clientId = settings.clientId as string;
    const clientSecret =
      (settings.clientSecret as string) ||
      process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    const body = new URLSearchParams({
      client_id: clientId,
      scope: Array.isArray(settings.scopes)
        ? (settings.scopes as string[]).join(' ')
        : 'openid profile email offline_access User.Read',
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      client_secret: clientSecret ?? '',
    });

    const response = await fetch(tokenUrl.replace('{tenant}', tenant), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new UnauthorizedException(`Token exchange failed: ${text}`);
    }
    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      scope?: string;
    };
  }

  private async fetchMicrosoftProfile(
    accessToken: string,
    settings: OAuthProviderSettings,
  ) {
    const url =
      (settings.graphUserUrl as string) ??
      'https://graph.microsoft.com/v1.0/me';
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new UnauthorizedException(
        `Failed to fetch Microsoft profile: ${text}`,
      );
    }
    return (await response.json()) as {
      id: string;
      userPrincipalName?: string;
      mail?: string | null;
      displayName?: string | null;
      givenName?: string | null;
      surname?: string | null;
    };
  }

  private async handleLogin(
    provider: { id: string; key: string; type: string },
    state: OAuthStatePayload,
    profile: {
      id: string;
      mail?: string | null;
      userPrincipalName?: string;
      displayName?: string | null;
    },
    context: RequestContext,
  ): Promise<OAuthResultPayload> {
    const externalId = profile.id;
    const account = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: provider.key,
          providerAccountId: externalId,
        },
      },
    });
    if (account) {
      const session = await this.authService.createSessionForUser(
        account.userId,
        state.rememberMe ?? false,
        context,
      );
      await this.logService.record({
        providerId: provider.id,
        providerKey: provider.key,
        providerType: provider.type,
        action: OAuthLogAction.LOGIN,
        status: OAuthLogStatus.SUCCESS,
        userId: account.userId,
        accountId: account.id,
      });
      return {
        success: true,
        mode: 'LOGIN',
        tokens: session.tokens,
        user: session.user,
      };
    }
    const email =
      profile.mail ||
      profile.userPrincipalName ||
      `${externalId}@microsoft.local`;
    const registerResult = await this.authService.createOauthUser(
      {
        email,
        name: profile.displayName ?? profile.userPrincipalName ?? email,
        rememberMe: state.rememberMe ?? true,
      },
      context,
    );
    await this.linkAccount(
      provider.key,
      externalId,
      registerResult.user.id,
      registerResult.tokens.refreshToken ?? null,
    );
    await this.logService.record({
      providerId: provider.id,
      providerKey: provider.key,
      providerType: provider.type,
      action: OAuthLogAction.REGISTER,
      status: OAuthLogStatus.SUCCESS,
      userId: registerResult.user.id,
      message: 'Created user via Microsoft OAuth',
    });
    return {
      success: true,
      mode: 'LOGIN',
      tokens: registerResult.tokens,
      user: registerResult.user,
    };
  }

  private async handleBinding(
    provider: { id: string; key: string; type: string },
    state: OAuthStatePayload,
    profile: { id: string },
  ): Promise<OAuthResultPayload> {
    if (!state.userId) {
      throw new UnauthorizedException('Binding requires authenticated user');
    }
    const existing = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: state.providerKey,
          providerAccountId: profile.id,
        },
      },
    });
    if (existing && existing.userId !== state.userId) {
      throw new BadRequestException(
        'This Microsoft account is already bound to another user',
      );
    }
    await this.linkAccount(
      state.providerKey,
      profile.id,
      state.userId,
      null,
    );
    await this.logService.record({
      providerId: provider.id,
      providerKey: state.providerKey,
      providerType: provider.type,
      action: OAuthLogAction.BIND,
      status: OAuthLogStatus.SUCCESS,
      userId: state.userId,
      metadata: { providerAccountId: profile.id },
    });
    return {
      success: true,
      mode: 'BIND',
      binding: { providerKey: state.providerKey, userId: state.userId },
    };
  }

  private async linkAccount(
    providerKey: string,
    providerAccountId: string,
    userId: string,
    refreshToken: string | null,
  ) {
    await this.prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: providerKey,
          providerAccountId,
        },
      },
      update: {
        userId,
        refreshToken,
      },
      create: {
        userId,
        accountId: generateRandomString(32, 'a-z', '0-9'),
        providerId: providerKey,
        provider: providerKey,
        providerAccountId,
        type: 'oauth',
        refreshToken,
      },
    });
  }
}
