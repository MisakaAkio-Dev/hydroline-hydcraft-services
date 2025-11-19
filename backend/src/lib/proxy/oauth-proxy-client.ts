import { OAuthProviderSettings } from '../../oauth/types/provider.types';

export interface OAuthProxyResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function getProxyConfig() {
  const proxyUrl = process.env.OAUTH_PROXY_URL || process.env.PROXY_URL;
  const proxyKey = process.env.OAUTH_PROXY_KEY || process.env.PROXY_KEY;
  return { proxyUrl, proxyKey };
}

export async function oauthProxyFetch(
  targetUrl: string,
  init: RequestInit,
  settings: OAuthProviderSettings,
): Promise<Response> {
  const { proxyUrl, proxyKey } = getProxyConfig();
  const useProxy = settings.providerProxyEnabled && proxyUrl && proxyKey;

  if (!useProxy) {
    try {
      return await fetch(targetUrl, init);
    } catch (error) {
      throw new Error(
        `Direct OAuth request failed (Target: ${targetUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const proxyRequestBody = {
    url: targetUrl,
    method: init.method || 'GET',
    headers: init.headers || {},
    bodyType: init.body instanceof URLSearchParams ? 'form' : 'raw',
    body:
      init.body instanceof URLSearchParams
        ? init.body.toString()
        : (init.body as any),
  };

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-key': proxyKey,
      },
      body: JSON.stringify(proxyRequestBody),
    });

    return response;
  } catch (error) {
    throw new Error(
      `OAuth Proxy request failed (Proxy: ${proxyUrl}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
