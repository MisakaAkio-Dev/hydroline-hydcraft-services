import { Injectable } from '@nestjs/common';
import { HydrolineBeaconClient } from './client';

interface BeaconPoolEntry {
  client: HydrolineBeaconClient;
  serverId: string;
  endpoint: string;
  key: string;
  timeoutMs?: number;
  maxRetry?: number;
  lastStatusFetchedAt?: number;
  // 重试控制
  attempts: number; // 已尝试连接次数
  retryTimer?: NodeJS.Timeout | null;
  lastAttemptAt?: number;
}

@Injectable()
export class HydrolineBeaconPoolService {
  private readonly pool = new Map<string, BeaconPoolEntry>();
  private readonly healthTimer: NodeJS.Timeout;

  constructor() {
    // 每 15s 做一次健康检查：若不连接且没有进行连接，强制重建 socket
    this.healthTimer = setInterval(() => this.healthCheck(), 15000);
  }

  private healthCheck() {
    for (const entry of this.pool.values()) {
      const status = entry.client.getConnectionStatus();
      // 若不在连接中且未连接，且未安排重试，则依据策略安排一次尝试
      if (!status.connected && !status.connecting && !entry.retryTimer) {
        this.scheduleNextAttempt(entry);
      }
    }
  }

  private computeDelayMsForAttempt(n: number): number {
    // 要求：失败后重试 10 次，间隔依次 5s、10s、30s、60s，然后保持 60s
    if (n <= 1) return 0; // 第一次立即尝试（由创建时触发）
    if (n === 2) return 5000;
    if (n === 3) return 10000;
    if (n === 4) return 30000;
    return 60000; // 第5次及之后
  }

  private scheduleNextAttempt(entry: BeaconPoolEntry) {
    if (entry.attempts >= 10) {
      return; // 超过 10 次停止
    }
    const nextAttemptIndex = entry.attempts + 1;
    const delay = this.computeDelayMsForAttempt(nextAttemptIndex);
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      // 已连接则不再重试
      const status = entry.client.getConnectionStatus();
      if (status.connected) return;
      // 执行一次尝试
      entry.attempts = nextAttemptIndex;
      entry.lastAttemptAt = Date.now();
      entry.client.forceReconnect();
      // 若仍未连接，下一轮 healthCheck 会安排下一次尝试
      // 也可直接在此继续排下轮，保持简单交给 healthCheck
    }, delay);
  }

  getOrCreate(opts: {
    serverId: string;
    endpoint: string;
    key: string;
    timeoutMs?: number;
    maxRetry?: number;
  }): HydrolineBeaconClient {
    const existing = this.pool.get(opts.serverId);
    if (existing) {
      const currentStatus = existing.client.getConnectionStatus();
      // 若配置发生变化（endpoint/key），重建连接
      if (existing.endpoint !== opts.endpoint || existing.key !== opts.key) {
        existing.client.forceReconnect();
        this.pool.delete(opts.serverId);
      } else {
        // 确保已有连接已初始化
        existing.client['forceReconnect']; // 访问以保持 tree-shaking 外部引用（无操作）
        existing.client['ensureSocket']; // 私有方法不可直接调用，仅保持引用（无操作）
        return existing.client;
      }
    }
    const client = new HydrolineBeaconClient({
      endpoint: opts.endpoint,
      key: opts.key,
      timeoutMs: opts.timeoutMs,
      maxRetry: opts.maxRetry,
    });
    // 触发首次连接
    // 立即进行第一次尝试
    client.forceReconnect();
    this.pool.set(opts.serverId, {
      client,
      serverId: opts.serverId,
      endpoint: opts.endpoint,
      key: opts.key,
      timeoutMs: opts.timeoutMs,
      maxRetry: opts.maxRetry,
      attempts: 0,
      retryTimer: null,
    });
    const entry = this.pool.get(opts.serverId)!;
    // 安排下一次尝试（根据策略）
    this.scheduleNextAttempt(entry);
    return client;
  }

  getStatus(serverId: string) {
    const entry = this.pool.get(serverId);
    if (!entry) return null;
    return entry.client.getConnectionStatus();
  }

  remove(serverId: string) {
    const entry = this.pool.get(serverId);
    if (entry) {
      if (entry.retryTimer) {
        clearTimeout(entry.retryTimer);
        entry.retryTimer = null;
      }
      entry.client.disconnect();
      this.pool.delete(serverId);
    }
  }

  listStatuses() {
    const result: Record<
      string,
      ReturnType<HydrolineBeaconClient['getConnectionStatus']>
    > = {};
    for (const [id, entry] of this.pool.entries()) {
      result[id] = entry.client.getConnectionStatus();
    }
    return result;
  }

  shutdown() {
    clearInterval(this.healthTimer);
    for (const entry of this.pool.values()) {
      if (entry.retryTimer) clearTimeout(entry.retryTimer);
      entry.client.disconnect();
    }
    this.pool.clear();
  }

  // 手动控制 API
  connect(serverId: string) {
    const entry = this.pool.get(serverId);
    if (!entry) throw new Error('Beacon entry not found');
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }
    entry.attempts = 0;
    entry.client.forceReconnect();
    this.scheduleNextAttempt(entry);
    return entry.client.getConnectionStatus();
  }

  reconnect(serverId: string) {
    const entry = this.pool.get(serverId);
    if (!entry) throw new Error('Beacon entry not found');
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }
    entry.attempts = 0;
    entry.client.forceReconnect();
    this.scheduleNextAttempt(entry);
    return entry.client.getConnectionStatus();
  }

  disconnect(serverId: string) {
    const entry = this.pool.get(serverId);
    if (!entry) throw new Error('Beacon entry not found');
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }
    entry.attempts = 0;
    entry.client.disconnect();
    return entry.client.getConnectionStatus();
  }
}
