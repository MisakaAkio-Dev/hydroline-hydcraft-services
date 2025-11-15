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
  extra?: Record<string, unknown>;
}

export interface OAuthStatePayload {
  providerKey: string;
  mode: OAuthFlowMode;
  redirectUri?: string;
  userId?: string;
  rememberMe?: boolean;
}

export interface OAuthResultPayload {
  success: boolean;
  mode: OAuthFlowMode;
  error?: string;
  tokens?: { accessToken: string | null; refreshToken: string | null };
  user?: Record<string, unknown> | null;
  binding?: { providerKey: string; userId: string } | null;
}
