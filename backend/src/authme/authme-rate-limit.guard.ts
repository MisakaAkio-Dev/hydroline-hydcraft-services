import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { AUTHME_BIND_RATE_LIMITS, AUTHME_BIND_RATE_LIMIT_WINDOW_MS } from './authme.constants';

interface BucketEntry {
  count: number;
  expiresAt: number;
}

@Injectable()
export class AuthmeRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, BucketEntry>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = extractIp(request) ?? 'unknown';
    const userId = request.user?.id as string | undefined;
    const now = Date.now();

    this.prune(now);

    if (!this.consume(`ip:${ip}`, AUTHME_BIND_RATE_LIMITS.ip, now)) {
      throw new HttpException('AuthMe 绑定请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (userId && !this.consume(`user:${userId}`, AUTHME_BIND_RATE_LIMITS.user, now)) {
      throw new HttpException('AuthMe 绑定请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private consume(key: string, limit: number, now: number): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      this.buckets.set(key, { count: 1, expiresAt: now + AUTHME_BIND_RATE_LIMIT_WINDOW_MS });
      return true;
    }
    if (bucket.count >= limit) {
      return false;
    }
    bucket.count += 1;
    return true;
  }

  private prune(now: number) {
    for (const [key, entry] of this.buckets.entries()) {
      if (entry.expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

function extractIp(request: any): string | null {
  if (!request) return null;
  const forwarded = request.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]);
  }
  if (typeof request.ip === 'string') {
    return request.ip;
  }
  if (typeof request.connection?.remoteAddress === 'string') {
    return request.connection.remoteAddress;
  }
  return null;
}
