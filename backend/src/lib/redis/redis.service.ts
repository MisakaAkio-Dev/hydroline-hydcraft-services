import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class RedisService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 缓存值，不存在则返回 null
   */
  async get<T = any>(key: string): Promise<T | null> {
    const value = await this.cacheManager.get<T>(key);
    return value === undefined ? null : value;
  }

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（毫秒）
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  /**
   * 删除多个缓存键
   * @param keys 缓存键数组
   */
  async delMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.cacheManager.del(key)));
  }

  /**
   * 清空所有缓存
   */
  async flush(): Promise<void> {
    const stores = (this.cacheManager as any).stores;
    if (stores && Array.isArray(stores)) {
      await Promise.all(stores.map((store) => store.clear?.()));
    }
  }

  /**
   * 检查缓存是否存在
   * @param key 缓存键
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * 获取缓存过期时间（秒）
   * @param key 缓存键
   */
  async ttl(key: string): Promise<number> {
    const stores = (this.cacheManager as any).stores;
    if (stores && stores[0] && stores[0].store?.client?.pttl) {
      const pttl = await stores[0].store.client.pttl(key);
      return Math.ceil(pttl / 1000);
    }
    return -1;
  }

  /**
   * 为现有缓存设置过期时间
   * @param key 缓存键
   * @param ttl 过期时间（毫秒）
   */
  async expire(key: string, ttl: number): Promise<void> {
    const value = await this.get(key);
    if (value !== null) {
      await this.set(key, value, ttl);
    }
  }

  /**
   * 增加数值
   * @param key 缓存键
   * @param delta 增加值（默认为1）
   */
  async incr(key: string, delta = 1): Promise<number> {
    const stores = (this.cacheManager as any).stores;
    if (stores && stores[0]?.store?.client?.incrby) {
      return await stores[0].store.client.incrby(key, delta);
    }
    const current = (await this.get<number>(key)) || 0;
    const newValue = current + delta;
    await this.set(key, newValue);
    return newValue;
  }

  /**
   * 减少数值
   * @param key 缓存键
   * @param delta 减少值（默认为1）
   */
  async decr(key: string, delta = 1): Promise<number> {
    const stores = (this.cacheManager as any).stores;
    if (stores && stores[0]?.store?.client?.decrby) {
      return await stores[0].store.client.decrby(key, delta);
    }
    const current = (await this.get<number>(key)) || 0;
    const newValue = current - delta;
    await this.set(key, newValue);
    return newValue;
  }

  /**
   * 获取原生 Redis 客户端（高级操作）
   */
  getClient() {
    const stores = (this.cacheManager as any).stores;
    return stores?.[0]?.store?.client;
  }
}
