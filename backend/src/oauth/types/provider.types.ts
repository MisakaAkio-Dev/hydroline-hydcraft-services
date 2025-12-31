export type OAuthFlowMode = 'LOGIN' | 'BIND';

export interface OAuthProviderSettings {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  redirectUri?: string;
  scopes?: string[];
  graphUserUrl?: string;
  graphPhotoUrl?: string;
  // 当 providerProxyEnabled 为 true 时，后端会将 OAuth HTTP 请求
  // 通过外部中转服务转发（例如腾讯云 Serverless），以规避直连受限的问题。
  providerProxyEnabled?: boolean;
  extra?: Record<string, unknown>;
}

export interface OAuthStatePayload {
  providerKey: string;
  mode: OAuthFlowMode;
  redirectUri?: string;
  userId?: string;
  rememberMe?: boolean;
  purpose?: 'DEFAULT' | 'XBOX' | 'XBOX_DEVICE';
  accountId?: string;
  deviceFlow?: {
    deviceCode: string;
    interval: number;
    expiresAt: string;
  };
}

export interface OAuthResultPayload {
  success: boolean;
  mode: OAuthFlowMode;
  error?: string;
  tokens?: { accessToken: string | null; refreshToken: string | null };
  user?: Record<string, unknown> | null;
  binding?: { providerKey: string; userId: string } | null;
}
