## Redis 集成指南

Redis 已经集成到项目中，提供了开箱即用的缓存功能。如果 Redis 未启动或配置不正确，应用会自动降级到内存缓存继续运行。

### 环境配置

在 `.env` 文件中配置 Redis 连接参数（参考 `.env.sample`）：

```env
# 启用/禁用 Redis（true 或 false）
REDIS_ENABLED="true"

REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD=""            # 如果没有密码则留空
REDIS_DB="0"                 # 数据库编号 (0-15)
REDIS_TTL="3600000"          # 默认过期时间（毫秒，默认1小时）
```

### 启动行为

- **Redis 可用且配置正确**：使用 Redis 作为缓存存储（推荐用于生产环境）
- **Redis 不可用或连接失败**：自动降级到内存缓存，应用继续正常运行（仅用于开发环境）
- **REDIS_ENABLED=false**：显式禁用 Redis，使用内存缓存（开发环境）

### 使用 RedisService

在任何需要缓存的地方注入 `RedisService`：

```typescript
import { RedisService } from './lib/redis/redis.service';

@Controller('example')
export class ExampleController {
  constructor(private readonly redisService: RedisService) {}

  @Get()
  async example() {
    // 设置缓存（ttl 可选，单位毫秒）
    await this.redisService.set('my_key', { data: 'value' }, 60000);

    // 获取缓存
    const value = await this.redisService.get('my_key');

    // 删除缓存
    await this.redisService.del('my_key');

    return value;
  }
}
```

### 可用方法

#### 基础操作

- **`get<T>(key: string): Promise<T | null>`** - 获取缓存值
- **`set<T>(key: string, value: T, ttl?: number): Promise<void>`** - 设置缓存（ttl 单位毫秒）
- **`del(key: string): Promise<void>`** - 删除缓存
- **`delMany(keys: string[]): Promise<void>`** - 删除多个缓存
- **`flush(): Promise<void>`** - 清空所有缓存
- **`exists(key: string): Promise<boolean>`** - 检查缓存是否存在

#### 高级操作

- **`ttl(key: string): Promise<number>`** - 获取缓存剩余过期时间（秒）
- **`expire(key: string, ttl: number): Promise<void>`** - 为现有缓存设置过期时间
- **`incr(key: string, delta?: number): Promise<number>`** - 增加数值
- **`decr(key: string, delta?: number): Promise<number>`** - 减少数值
- **`getClient()`** - 获取原生 Redis 客户端（用于复杂操作）

### 使用示例

```typescript
// 设置和获取
await this.redisService.set('user:123', { name: 'John' }, 3600000);
const user = await this.redisService.get('user:123');

// 计数器
const count = await this.redisService.incr('page_views');
await this.redisService.decr('inventory_count', 5);

// 检查和删除
if (await this.redisService.exists('temp_token')) {
  await this.redisService.del('temp_token');
}

// 批量操作
const keys = ['key1', 'key2', 'key3'];
await this.redisService.delMany(keys);
```

### 启动 Redis（开发环境）

#### 使用 Docker（推荐）

```bash
docker run -d -p 6379:6379 --name redis redis:latest
```

#### 使用本地 Redis 服务器

```bash
redis-server
```

#### 验证 Redis 连接

```bash
redis-cli ping
# 返回 PONG 说明连接成功
```

### 生产环境配置

在生产环境中，根据你的部署方式配置 Redis 连接参数，例如：

```env
REDIS_ENABLED="true"
REDIS_HOST="redis.example.com"
REDIS_PORT="6379"
REDIS_PASSWORD="your-secure-password"
REDIS_DB="0"
REDIS_TTL="3600000"
```

### 开发环境不想使用 Redis

如果在开发环境不想启动 Redis，只需在 `.env` 中设置：

```env
REDIS_ENABLED=false
```

应用会使用内存缓存（不持久化，重启后清空）。
