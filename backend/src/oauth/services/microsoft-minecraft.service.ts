import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Account } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthProvidersService } from './oauth-providers.service';
import { oauthProxyFetch } from '../../lib/proxy/oauth-proxy-client';
import type { OAuthProviderSettings } from '../types/provider.types';

type MinecraftProfileSnapshot = {
  updatedAt: string;
  java: null | { name: string; uuid: string };
  bedrock: null | { gamertag: string; xuid: string };
};

type MinecraftAuthTokens = {
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAt?: string | null;
  updatedAt?: string | null;
};

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

@Injectable()
export class MicrosoftMinecraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: OAuthProvidersService,
  ) {}

  async startXboxDeviceFlow(options: { userId: string; accountId: string }) {
    await this.requireMicrosoftAccount(options.userId, options.accountId);
    const runtime = await this.providers.requireRuntimeProvider('microsoft');
    const clientId = runtime.settings.clientId as string;
    if (!clientId) {
      throw new BadRequestException('Microsoft OAuth configuration is missing');
    }
    const url =
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
    const body = new URLSearchParams({
      client_id: clientId,
      scope: 'XboxLive.signin offline_access',
    });
    const response = await oauthProxyFetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      runtime.settings,
    );
    const text = await response.text();
    if (!response.ok) {
      throw new BadRequestException(
        `Microsoft device code request failed: ${text}`,
      );
    }
    const payload = JSON.parse(text) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval?: number;
    };
    return {
      deviceCode: payload.device_code,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      expiresIn: payload.expires_in,
      interval: payload.interval ?? 5,
    };
  }

  async pollXboxDeviceFlow(options: { deviceCode: string }) {
    const runtime = await this.providers.requireRuntimeProvider('microsoft');
    const clientId = runtime.settings.clientId as string;
    if (!clientId) {
      throw new BadRequestException('Microsoft OAuth configuration is missing');
    }
    const url = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: options.deviceCode,
    });
    const response = await oauthProxyFetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      runtime.settings,
    );
    const text = await response.text();
    if (!response.ok) {
      try {
        const payload = JSON.parse(text) as {
          error?: string;
          error_description?: string;
          interval?: number;
        };
        return { ok: false as const, payload };
      } catch {
        throw new BadRequestException(`Microsoft device flow failed: ${text}`);
      }
    }
    const payload = JSON.parse(text) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    return { ok: true as const, payload };
  }

  async storeMinecraftAuthTokens(options: {
    accountId: string;
    userId: string;
    token: {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
  }) {
    const account = await this.requireMicrosoftAccount(
      options.userId,
      options.accountId,
    );
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
    const base =
      account.profile && typeof account.profile === 'object'
        ? (account.profile as Record<string, unknown>)
        : {};
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

  async syncForUserAccount(options: { userId: string; accountId: string }) {
    const account = await this.prisma.account.findUnique({
      where: { id: options.accountId },
    });
    if (!account || account.userId !== options.userId) {
      throw new BadRequestException('OAuth binding does not exist');
    }
    if (account.provider !== 'microsoft') {
      throw new BadRequestException('Only Microsoft accounts can be synced');
    }
    const runtime = await this.providers.requireRuntimeProvider('microsoft');
    const accessToken = await this.ensureMicrosoftAccessToken(
      account,
      runtime.settings,
    );
    const snapshot = await this.fetchMinecraftSnapshot(
      accessToken,
      runtime.settings,
    );
    await this.updateAccountMinecraftProfile(account, snapshot);
    return {
      accountId: account.id,
      profile: account.profile ?? null,
      minecraft: snapshot,
    };
  }

  private async ensureMicrosoftAccessToken(
    account: Account,
    settings: OAuthProviderSettings,
  ) {
    const minecraftAuth = this.readMinecraftAuth(account.profile);
    if (!minecraftAuth) {
      throw new BadRequestException(
        'Xbox Live authentication failed, please re-bind this Microsoft account',
      );
    }
    const accessToken = readString(minecraftAuth.accessToken);
    const expiresAt = minecraftAuth.accessTokenExpiresAt
      ? Date.parse(minecraftAuth.accessTokenExpiresAt)
      : 0;
    const stillValid =
      accessToken &&
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now() + 60 * 1000;
    if (stillValid) {
      return accessToken;
    }
    const refreshToken = readString(minecraftAuth.refreshToken);
    if (!refreshToken) {
      throw new BadRequestException(
        'Xbox Live authentication failed, please re-bind this Microsoft account',
      );
    }
    const refreshed = await this.refreshMicrosoftToken(refreshToken, settings, [
      'XboxLive.signin',
      'offline_access',
    ]);
    const updatedAuth = {
      accessToken: refreshed.accessToken,
      refreshToken:
        refreshed.refreshToken ?? minecraftAuth.refreshToken ?? null,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt
        ? refreshed.accessTokenExpiresAt.toISOString()
        : null,
      updatedAt: new Date().toISOString(),
    };
    const base =
      account.profile && typeof account.profile === 'object'
        ? (account.profile as Record<string, unknown>)
        : {};
    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        profile: {
          ...base,
          minecraftAuth: updatedAuth,
        } as Prisma.InputJsonValue,
      },
    });
    return refreshed.accessToken;
  }

  private async refreshMicrosoftToken(
    refreshToken: string,
    settings: OAuthProviderSettings,
    scopes: string[],
  ) {
    const tenant = (settings.tenantId as string) || 'common';
    const tokenUrl =
      (settings.tokenUrl as string) ||
      'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';
    const clientId = settings.clientId as string;
    const clientSecret = settings.clientSecret as string;
    if (!clientId || !clientSecret) {
      throw new BadRequestException('Microsoft OAuth configuration is missing');
    }
    const scope = scopes.join(' ');
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope,
    });

    const response = await oauthProxyFetch(
      tokenUrl.replace('{tenant}', tenant),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      settings,
    );
    const text = await response.text();
    if (!response.ok) {
      throw new BadRequestException(`Microsoft refresh token failed: ${text}`);
    }
    const payload = JSON.parse(text) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      scope?: string;
    };
    const accessToken = readString(payload.access_token);
    if (!accessToken) {
      throw new BadRequestException(
        'Microsoft refresh token response missing access_token',
      );
    }
    const expiresIn = Number(payload.expires_in ?? 0);
    const accessTokenExpiresAt =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : null;
    return {
      accessToken,
      accessTokenExpiresAt,
      refreshToken: readString(payload.refresh_token),
      idToken: readString(payload.id_token),
      scope: readString(payload.scope),
    };
  }

  private async fetchMinecraftSnapshot(
    microsoftAccessToken: string,
    settings: OAuthProviderSettings,
  ): Promise<MinecraftProfileSnapshot> {
    const xbl = await this.postJson(
      'https://user.auth.xboxlive.com/user/authenticate',
      {
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${microsoftAccessToken}`,
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      },
      settings,
    );
    const xblToken = readString(xbl?.Token);
    const uhs = readString(xbl?.DisplayClaims?.xui?.[0]?.uhs);
    if (!xblToken || !uhs) {
      throw new BadRequestException('Failed to obtain Xbox Live token');
    }

    const xstsXbox = await this.postJson(
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xblToken],
        },
        RelyingParty: 'http://xboxlive.com',
        TokenType: 'JWT',
      },
      settings,
    );
    const bedrockXuid = readString(xstsXbox?.DisplayClaims?.xui?.[0]?.xid);
    const bedrockGamertag = readString(xstsXbox?.DisplayClaims?.xui?.[0]?.gtg);

    const xstsMinecraft = await this.postJson(
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xblToken],
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      },
      settings,
    );
    const xstsToken = readString(xstsMinecraft?.Token);
    if (!xstsToken) {
      throw new BadRequestException('Failed to obtain Minecraft XSTS token');
    }

    const mcAuth = await this.postJson(
      'https://api.minecraftservices.com/authentication/login_with_xbox',
      {
        identityToken: `XBL3.0 x=${uhs};${xstsToken}`,
      },
      settings,
    );
    const mcAccessToken = readString(mcAuth?.access_token);
    if (!mcAccessToken) {
      throw new BadRequestException('Failed to obtain Minecraft access token');
    }

    const profile = await this.getJson(
      'https://api.minecraftservices.com/minecraft/profile',
      {
        Authorization: `Bearer ${mcAccessToken}`,
      },
      settings,
      { allow404: true },
    );
    const javaUuid = readString(profile?.id);
    const javaName = readString(profile?.name);

    return {
      updatedAt: new Date().toISOString(),
      java: javaUuid && javaName ? { uuid: javaUuid, name: javaName } : null,
      bedrock:
        bedrockXuid && bedrockGamertag
          ? { xuid: bedrockXuid, gamertag: bedrockGamertag }
          : null,
    };
  }

  private async postJson(
    url: string,
    body: unknown,
    settings: OAuthProviderSettings,
  ) {
    const response = await oauthProxyFetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      settings,
    );
    const text = await response.text();
    if (!response.ok) {
      if (
        response.status === 400 &&
        url.includes('user.auth.xboxlive.com/user/authenticate')
      ) {
        throw new BadRequestException(
          'Xbox Live authentication failed, please re-bind this Microsoft account',
        );
      }
      const summary = text || response.statusText || 'Unknown error';
      throw new BadRequestException(
        `Request failed (${response.status}) ${url}: ${summary}`,
      );
    }
    return text ? JSON.parse(text) : null;
  }

  private async getJson(
    url: string,
    headers: Record<string, string>,
    settings: OAuthProviderSettings,
    options?: { allow404?: boolean },
  ) {
    const response = await oauthProxyFetch(
      url,
      { method: 'GET', headers },
      settings,
    );
    if (options?.allow404 && response.status === 404) {
      return null;
    }
    const text = await response.text();
    if (!response.ok) {
      const summary = text || response.statusText || 'Unknown error';
      throw new BadRequestException(
        `Request failed (${response.status}) ${url}: ${summary}`,
      );
    }
    return text ? JSON.parse(text) : null;
  }

  private async updateAccountMinecraftProfile(
    account: Account,
    minecraft: MinecraftProfileSnapshot,
  ) {
    await this.prisma.accountMinecraftProfile.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        javaName: minecraft.java?.name ?? null,
        javaUuid: minecraft.java?.uuid ?? null,
        bedrockGamertag: minecraft.bedrock?.gamertag ?? null,
        bedrockXuid: minecraft.bedrock?.xuid ?? null,
      },
      update: {
        javaName: minecraft.java?.name ?? null,
        javaUuid: minecraft.java?.uuid ?? null,
        bedrockGamertag: minecraft.bedrock?.gamertag ?? null,
        bedrockXuid: minecraft.bedrock?.xuid ?? null,
      },
    });
  }

  private readMinecraftAuth(profile: unknown): MinecraftAuthTokens | null {
    if (!profile || typeof profile !== 'object') return null;
    const record = profile as Record<string, unknown>;
    const auth = record.minecraftAuth;
    if (!auth || typeof auth !== 'object') return null;
    const authRecord = auth as Record<string, unknown>;
    return {
      accessToken:
        typeof authRecord.accessToken === 'string'
          ? authRecord.accessToken
          : null,
      refreshToken:
        typeof authRecord.refreshToken === 'string'
          ? authRecord.refreshToken
          : null,
      accessTokenExpiresAt:
        typeof authRecord.accessTokenExpiresAt === 'string'
          ? authRecord.accessTokenExpiresAt
          : null,
      updatedAt:
        typeof authRecord.updatedAt === 'string' ? authRecord.updatedAt : null,
    };
  }

  private async requireMicrosoftAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account || account.userId !== userId) {
      throw new BadRequestException('OAuth binding does not exist');
    }
    if (account.provider !== 'microsoft') {
      throw new BadRequestException('Only Microsoft accounts can be synced');
    }
    return account;
  }
}
