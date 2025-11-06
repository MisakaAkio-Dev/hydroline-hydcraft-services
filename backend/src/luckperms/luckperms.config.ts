export interface LuckpermsPoolConfig {
  min: number;
  max: number;
  idleMillis: number;
  acquireTimeoutMillis: number;
}

export interface LuckpermsDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  charset: string;
  pool: LuckpermsPoolConfig;
  connectTimeoutMillis: number;
  readonly: boolean;
  enabled: boolean;
}

export function isValidLuckpermsConfig(
  config: Partial<LuckpermsDbConfig> | null | undefined,
): config is LuckpermsDbConfig {
  if (!config) return false;
  return (
    typeof config.host === 'string' &&
    typeof config.port === 'number' &&
    typeof config.database === 'string' &&
    typeof config.user === 'string' &&
    typeof config.password === 'string' &&
    typeof config.charset === 'string' &&
    typeof config.connectTimeoutMillis === 'number' &&
    typeof config.readonly === 'boolean' &&
    typeof config.enabled === 'boolean' &&
    typeof config.pool === 'object' &&
    config.pool !== null &&
    typeof config.pool.min === 'number' &&
    typeof config.pool.max === 'number' &&
    typeof config.pool.idleMillis === 'number' &&
    typeof config.pool.acquireTimeoutMillis === 'number'
  );
}
