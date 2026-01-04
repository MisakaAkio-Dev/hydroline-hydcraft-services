import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuthLogAction, OAuthLogStatus, Prisma } from '@prisma/client';
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
import { oauthProxyFetch } from '../../lib/proxy/oauth-proxy-client';
import { AuthService, RequestContext } from '../../auth/services/auth.service';
import { generateRandomString } from 'better-auth/crypto';
import { MicrosoftMinecraftService } from './microsoft-minecraft.service';

interface StartFlowInput {
  providerKey: string;
  mode: OAuthFlowMode;
  redirectUri: string;
  userId?: string;
  rememberMe?: boolean;
  purpose?: 'DEFAULT' | 'XBOX' | 'XBOX_DEVICE';
  accountId?: string;
}

interface AccountProfilePayload extends Record<string, unknown> {
  id: string;
  displayName?: string | null;
  email?: string | null;
  userPrincipalName?: string | null;
  avatarDataUri?: string | null;
}

type ProviderProfile = {
  id: string;
  mail?: string | null;
  email?: string | null;
  userPrincipalName?: string | null;
  displayName?: string | null;
};

@Injectable()
export class OAuthFlowService {
  private readonly logger = new Logger(OAuthFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: OAuthProvidersService,
    private readonly stateService: OAuthStateService,
    private readonly logService: OAuthLogService,
    private readonly authService: AuthService,
    private readonly microsoftMinecraft: MicrosoftMinecraftService,
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
      purpose: input.purpose ?? 'DEFAULT',
      accountId: input.accountId,
    });

    const authorizeUrl = this.buildAuthorizeUrl(
      runtime.settings,
      runtime.provider.key,
      state,
      input.purpose ?? 'DEFAULT',
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
    purpose: 'DEFAULT' | 'XBOX' | 'XBOX_DEVICE',
  ) {
    if (providerKey === 'qq') {
      const authorizeUrl =
        (settings.authorizeUrl as string) ??
        'https://graph.qq.com/oauth2.0/authorize';
      const redirectUri = this.resolveRedirectUri(settings, providerKey);
      const scopes = Array.isArray(settings.scopes)
        ? settings.scopes
        : ['get_user_info'];
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: (settings.clientId as string) ?? '',
        redirect_uri: redirectUri,
        state,
        scope: scopes.join(','),
      });
      return `${authorizeUrl}?${params.toString()}`;
    }
    const tenant = (settings.tenantId as string) || 'common';
    const baseAuthorize =
      (settings.authorizeUrl as string) ||
      'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize';
    const redirectUri = this.resolveRedirectUri(settings, providerKey);
    const scopes =
      providerKey === 'microsoft'
        ? this.resolveMicrosoftScopes(settings, purpose)
        : Array.isArray(settings.scopes)
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

  private resolveRedirectUri(
    settings: OAuthProviderSettings,
    providerKey: string,
  ) {
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
      statePayload.purpose ?? 'DEFAULT',
    );

    if (statePayload.purpose === 'XBOX') {
      if (!statePayload.userId || !statePayload.accountId) {
        throw new BadRequestException('Invalid Xbox consent state');
      }
      await this.storeXboxTokens({
        accountId: statePayload.accountId,
        userId: statePayload.userId,
        providerKey: input.providerKey,
        token,
      });
      const result = {
        success: true,
        mode: 'BIND',
        binding: {
          providerKey: input.providerKey,
          userId: statePayload.userId,
        },
      } as const;
      await this.stateService.storeResult(input.state, result);
      return {
        redirectUri: statePayload.redirectUri,
        result,
      };
    }

    const { profile, avatarDataUri } = await this.fetchProviderProfile(
      input.providerKey,
      token.access_token,
      runtime.settings,
    );
    const accountProfile = this.buildAccountProfile(profile, avatarDataUri);

    const resultPayload =
      statePayload.mode === 'BIND'
        ? await this.handleBinding(
            runtime.provider,
            statePayload,
            profile,
            accountProfile,
            token,
          )
        : await this.handleLogin(
            runtime.provider,
            statePayload,
            profile,
            accountProfile,
            token,
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

  async unlink(providerKey: string, userId: string, accountId?: string) {
    const account = accountId
      ? await this.prisma.account.findUnique({ where: { id: accountId } })
      : await this.prisma.account.findFirst({
          where: { provider: providerKey, userId },
        });
    if (!account) {
      throw new BadRequestException(
        'Current account is not bound to this provider',
      );
    }
    if (account.userId !== userId) {
      throw new BadRequestException(
        'Current account is not bound to the authenticated user',
      );
    }
    if (account.provider !== providerKey) {
      throw new BadRequestException(
        'Account provider does not match the requested provider',
      );
    }
    await this.prisma.account.delete({ where: { id: account.id } });
    const runtime = await this.providers.resolveRuntimeProvider(providerKey);
    await this.logService.record({
      providerId: runtime?.provider.id ?? null,
      providerKey,
      providerType:
        runtime?.provider.type ?? providerKey.toUpperCase() ?? 'OAUTH',
      action: OAuthLogAction.UNBIND,
      status: OAuthLogStatus.SUCCESS,
      userId,
      accountId: null,
      message: 'User removed OAuth binding',
      metadata: { providerAccountId: account.providerAccountId },
    });
    return true;
  }

  private async exchangeToken(
    settings: OAuthProviderSettings,
    code: string,
    providerKey: string,
    purpose: 'DEFAULT' | 'XBOX' | 'XBOX_DEVICE' = 'DEFAULT',
  ) {
    if (providerKey === 'qq') {
      return this.exchangeQqToken(settings, code);
    }
    const tenant = (settings.tenantId as string) || 'common';
    const tokenUrl =
      (settings.tokenUrl as string) ||
      'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';
    const redirectUri = this.resolveRedirectUri(settings, providerKey);
    const clientId = settings.clientId as string;
    const clientSecret =
      (settings.clientSecret as string) ||
      process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    const scopes =
      providerKey === 'microsoft'
        ? this.resolveMicrosoftScopes(settings, purpose)
        : Array.isArray(settings.scopes)
          ? settings.scopes
          : ['openid', 'profile', 'email', 'offline_access', 'User.Read'];
    const body = new URLSearchParams({
      client_id: clientId,
      scope: scopes.join(' '),
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      client_secret: clientSecret ?? '',
    });

    const response = await oauthProxyFetch(
      tokenUrl.replace('{tenant}', tenant),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
      settings,
    );
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

  private async exchangeQqToken(
    settings: OAuthProviderSettings,
    code: string,
  ): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }> {
    const tokenUrl =
      (settings.tokenUrl as string) ?? 'https://graph.qq.com/oauth2.0/token';
    const redirectUri = this.resolveRedirectUri(settings, 'qq');
    const clientId =
      (settings.clientId as string) ?? process.env.QQ_OAUTH_CLIENT_ID ?? '';
    const clientSecret =
      (settings.clientSecret as string) ??
      process.env.QQ_OAUTH_CLIENT_SECRET ??
      '';
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const response = await oauthProxyFetch(
      tokenUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
      settings,
    );
    const text = await response.text();
    if (!response.ok) {
      throw new UnauthorizedException(`QQ token exchange failed: ${text}`);
    }
    const params = new URLSearchParams(text);
    const accessToken = params.get('access_token');
    if (!accessToken) {
      throw new UnauthorizedException('QQ token response missing access_token');
    }
    const expiresIn = params.get('expires_in');
    return {
      access_token: accessToken,
      refresh_token: params.get('refresh_token') ?? undefined,
      expires_in: expiresIn ? Number(expiresIn) : undefined,
      scope: params.get('scope') ?? undefined,
    };
  }

  private async fetchProviderProfile(
    providerKey: string,
    accessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<{ profile: ProviderProfile; avatarDataUri: string | null }> {
    if (providerKey === 'google') {
      return this.fetchGoogleProfile(accessToken, settings);
    }
    if (providerKey === 'qq') {
      return this.fetchQqProfile(accessToken, settings);
    }
    return this.fetchMicrosoftProviderProfile(accessToken, settings);
  }

  private async fetchMicrosoftProviderProfile(
    accessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<{ profile: ProviderProfile; avatarDataUri: string | null }> {
    const profile = await this.fetchMicrosoftProfile(accessToken, settings);
    const avatarDataUri = await this.fetchMicrosoftPhoto(accessToken, settings);
    return { profile, avatarDataUri };
  }

  private async fetchMicrosoftProfile(
    accessToken: string,
    settings: OAuthProviderSettings,
  ) {
    const url =
      (settings.graphUserUrl as string) ??
      'https://graph.microsoft.com/v1.0/me';
    const response = await oauthProxyFetch(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      settings,
    );
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

  private async fetchGoogleProfile(
    accessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<{ profile: ProviderProfile; avatarDataUri: string | null }> {
    const url =
      (settings.graphUserUrl as string) ??
      'https://www.googleapis.com/oauth2/v3/userinfo';
    const response = await oauthProxyFetch(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      settings,
    );
    if (!response.ok) {
      const text = await response.text();
      throw new UnauthorizedException(
        `Failed to fetch Google profile: ${text}`,
      );
    }
    const data = (await response.json()) as {
      sub?: string;
      id?: string;
      email?: string | null;
      name?: string | null;
      given_name?: string | null;
      family_name?: string | null;
      picture?: string | null;
    };
    const profile: ProviderProfile = {
      id: data.sub ?? data.id ?? '',
      email: data.email ?? null,
      mail: data.email ?? null,
      displayName: (() => {
        if (data.name) return data.name;
        const combined = [data.given_name, data.family_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        return combined || null;
      })(),
      userPrincipalName: data.email ?? null,
    };
    if (!profile.id) {
      throw new UnauthorizedException('Invalid Google profile payload');
    }
    const avatarDataUri = await this.fetchImageAsDataUri(
      data.picture ?? null,
      settings,
    );
    return { profile, avatarDataUri };
  }

  private async fetchQqProfile(
    accessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<{ profile: ProviderProfile; avatarDataUri: string | null }> {
    const { openid, unionid } = await this.fetchQqOpenId(accessToken, settings);
    const info = await this.fetchQqUserInfo(accessToken, settings, openid);
    const avatarUrl = info.figureurl_qq_2 ?? info.figureurl_qq_1 ?? null;
    const avatarDataUri = await this.fetchImageAsDataUri(avatarUrl, settings);
    const profile: ProviderProfile = {
      id: openid,
      email: null,
      mail: null,
      displayName: info.nickname ?? null,
      userPrincipalName: unionid ?? null,
    };
    return { profile, avatarDataUri };
  }

  private async fetchQqOpenId(
    accessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<{ openid: string; unionid?: string }> {
    const openIdUrl = 'https://graph.qq.com/oauth2.0/me';
    const response = await oauthProxyFetch(
      `${openIdUrl}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'GET',
      },
      settings,
    );
    const text = await response.text();
    if (!response.ok) {
      throw new UnauthorizedException(`Failed to fetch QQ openid: ${text}`);
    }
    const payload = this.parseQqCallbackPayload(text);
    if (!payload.openid) {
      throw new UnauthorizedException('QQ openid response missing openid');
    }
    return { openid: payload.openid, unionid: payload.unionid };
  }

  private async fetchQqUserInfo(
    accessToken: string,
    settings: OAuthProviderSettings,
    openid: string,
  ) {
    const base =
      (settings.graphUserUrl as string) ??
      'https://graph.qq.com/user/get_user_info';
    const url = new URL(base);
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set(
      'oauth_consumer_key',
      (settings.clientId as string) ?? process.env.QQ_OAUTH_CLIENT_ID ?? '',
    );
    url.searchParams.set('openid', openid);
    url.searchParams.set('format', 'json');
    const response = await oauthProxyFetch(
      url.toString(),
      {
        method: 'GET',
      },
      settings,
    );
    const text = await response.text();
    if (!response.ok) {
      throw new UnauthorizedException(`Failed to fetch QQ profile: ${text}`);
    }
    const data = JSON.parse(text) as {
      ret?: number;
      msg?: string;
      nickname?: string;
      figureurl_qq_1?: string;
      figureurl_qq_2?: string;
    };
    if (data.ret && data.ret !== 0) {
      throw new UnauthorizedException(
        `QQ profile returned error: ${String(data.msg ?? data.ret)}`,
      );
    }
    return data;
  }

  private parseQqCallbackPayload(text: string) {
    const trimmed = text.trim();
    // Normalize BOM and allow QQ's callback wrapper to include whitespace/newlines around punctuation.
    const normalized = trimmed.replace(/^\uFEFF/, '');
    const match = normalized.match(/^callback\s*\(\s*([\s\S]+?)\s*\)\s*;?$/i);
    const payloadText = match ? match[1] : normalized;
    try {
      return JSON.parse(payloadText);
    } catch (error) {
      throw new UnauthorizedException(
        `Invalid QQ callback payload: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private buildAccountProfile(
    profile: ProviderProfile,
    avatarDataUri?: string | null,
  ): AccountProfilePayload {
    const email = profile.email ?? profile.mail ?? null;
    return {
      id: profile.id,
      displayName: profile.displayName ?? profile.userPrincipalName ?? email,
      email,
      userPrincipalName: profile.userPrincipalName ?? null,
      avatarDataUri: avatarDataUri ?? null,
    };
  }

  private resolveMicrosoftScopes(
    settings: OAuthProviderSettings,
    purpose: 'DEFAULT' | 'XBOX' | 'XBOX_DEVICE',
  ) {
    if (purpose === 'XBOX' || purpose === 'XBOX_DEVICE') {
      return ['XboxLive.signin', 'offline_access'];
    }
    const base = Array.isArray(settings.scopes)
      ? settings.scopes
      : ['openid', 'profile', 'email', 'offline_access', 'User.Read'];
    return base.filter((scope) => scope !== 'XboxLive.signin');
  }

  private async storeXboxTokens(options: {
    accountId: string;
    userId: string;
    providerKey: string;
    token: {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      scope?: string;
    };
  }) {
    if (options.providerKey !== 'microsoft') {
      throw new BadRequestException('Only Microsoft accounts can be synced');
    }
    const account = await this.prisma.account.findUnique({
      where: { id: options.accountId },
    });
    if (!account || account.userId !== options.userId) {
      throw new BadRequestException('OAuth binding does not exist');
    }
    if (account.provider !== 'microsoft') {
      throw new BadRequestException('Only Microsoft accounts can be synced');
    }
    const base =
      account.profile && typeof account.profile === 'object'
        ? (account.profile as Record<string, unknown>)
        : {};
    const expiresIn = Number(options.token.expires_in ?? 0);
    const accessTokenExpiresAt =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;
    const minecraftAuth = {
      accessToken: options.token.access_token,
      refreshToken: options.token.refresh_token ?? null,
      accessTokenExpiresAt,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        profile: {
          ...base,
          minecraftAuth,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async fetchMicrosoftPhoto(
    accessToken: string,
    settings: OAuthProviderSettings,
  ) {
    const url =
      (settings.graphPhotoUrl as string) ??
      'https://graph.microsoft.com/v1.0/me/photo/$value';
    try {
      const response = await oauthProxyFetch(
        url,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        settings,
      );
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        return null;
      }
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Microsoft profile avatar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async fetchImageAsDataUri(
    url: string | null | undefined,
    settings: OAuthProviderSettings,
  ) {
    if (!url) {
      return null;
    }
    try {
      const response = await oauthProxyFetch(url, {}, settings);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        return null;
      }
      const contentType =
        response.headers.get('content-type') ?? 'application/octet-stream';
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch image for avatar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async handleLogin(
    provider: { id: string; key: string; type: string },
    state: OAuthStatePayload,
    profile: ProviderProfile,
    accountProfile: AccountProfilePayload,
    token: {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      scope?: string;
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
      const tokenUpdate = this.buildAccountTokenUpdate(token);
      await this.prisma.account.update({
        where: { id: account.id },
        data: {
          profile: accountProfile
            ? (accountProfile as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          ...tokenUpdate,
        },
      });
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
      profile.email ||
      profile.mail ||
      profile.userPrincipalName ||
      `${externalId}@${provider.key}.local`;
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
      token,
      accountProfile,
    );
    await this.logService.record({
      providerId: provider.id,
      providerKey: provider.key,
      providerType: provider.type,
      action: OAuthLogAction.REGISTER,
      status: OAuthLogStatus.SUCCESS,
      userId: registerResult.user.id,
      message: `Created user via ${provider.type ?? provider.key} OAuth`,
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
    profile: ProviderProfile,
    accountProfile: AccountProfilePayload,
    token: {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      scope?: string;
    },
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
        'This account is already bound to another user',
      );
    }
    const linked = await this.linkAccount(
      state.providerKey,
      profile.id,
      state.userId,
      token,
      accountProfile,
    );
    if (state.providerKey === 'microsoft' && state.purpose === 'XBOX') {
      try {
        await this.microsoftMinecraft.syncForUserAccount({
          userId: state.userId,
          accountId: linked.id,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to sync Minecraft profile after binding: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
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

  async storeErrorResult(options: {
    state: string;
    error: string;
    description?: string;
  }) {
    const message = options.description
      ? `${options.error}: ${options.description}`
      : options.error;
    const statePayload = await this.stateService.consumeState(options.state);
    if (!statePayload) {
      throw new BadRequestException('Invalid or expired state');
    }
    await this.stateService.storeResult(options.state, {
      success: false,
      mode: 'BIND',
      error: message,
    });
    return statePayload.redirectUri;
  }

  private buildAccountTokenUpdate(token: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    scope?: string;
  }) {
    const expiresIn = Number(token.expires_in ?? 0);
    const accessTokenExpiresAt =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : null;
    return {
      accessToken: token.access_token,
      accessTokenExpiresAt,
      ...(token.refresh_token && { refreshToken: token.refresh_token }),
      ...(token.id_token && { idToken: token.id_token }),
      ...(token.scope && { scope: token.scope }),
    } as const;
  }

  private async linkAccount(
    providerKey: string,
    providerAccountId: string,
    userId: string,
    token: {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      scope?: string;
    },
    accountProfile?: AccountProfilePayload,
  ) {
    const tokenData = this.buildAccountTokenUpdate(token);
    return this.prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: providerKey,
          providerAccountId,
        },
      },
      update: {
        userId,
        ...tokenData,
        ...(accountProfile && {
          profile: accountProfile as Prisma.InputJsonValue,
        }),
      },
      create: {
        userId,
        accountId: generateRandomString(32, 'a-z', '0-9'),
        providerId: providerKey,
        provider: providerKey,
        providerAccountId,
        type: 'oauth',
        ...tokenData,
        profile: accountProfile
          ? (accountProfile as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
      select: { id: true },
    });
  }
}
