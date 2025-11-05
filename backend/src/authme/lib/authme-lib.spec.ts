import type { Pool } from 'mysql2/promise';
import { MysqlAuthmeLib } from './authme-lib';
import { AuthmeDbConfig } from '../authme.config';
import type { AuthmeMetricsRecorder } from '../authme.metrics';
import { AuthmeError } from '../authme.errors';

const baseConfig: AuthmeDbConfig = {
  host: 'localhost',
  port: 3306,
  database: 'authme',
  user: 'user',
  password: 'pass',
  charset: 'utf8mb4',
  connectTimeoutMillis: 1000,
  readonly: true,
  enabled: true,
  pool: {
    min: 0,
    max: 5,
    idleMillis: 30_000,
    acquireTimeoutMillis: 10_000,
  },
};

const METRICS_STUB: AuthmeMetricsRecorder = {
  setConnected: jest.fn(),
  observeQuery: jest.fn(),
  incrementVerifyFailed: jest.fn(),
};

describe('MysqlAuthmeLib', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const passwordSample =
    '$SHA$71cd23e64f05609c$e2919c011a429b22ac7917cab2601a88037fd1ba8de144bb8b6f01a412f346bb';

  function createPool(
    mockResponses: Array<{ sqlIncludes: string; rows: any[] }>,
  ): Pool {
    const query = jest.fn(async (sql: string) => {
      const matched = mockResponses.find((entry) =>
        sql.includes(entry.sqlIncludes),
      );
      if (!matched) {
        throw new Error(`Unexpected SQL: ${sql}`);
      }
      return [matched.rows, []];
    });
    const getConnection = jest.fn(async () => ({
      query: async () => [[], []],
      release: () => undefined,
    }));
    const end = jest.fn(async () => undefined);
    return { query, getConnection, end } as unknown as Pool;
  }

  it('verifies $SHA$ passwords using official sample', async () => {
    const pool = createPool([]);
    const lib = new MysqlAuthmeLib({
      config: baseConfig,
      poolOverride: pool,
      metrics: METRICS_STUB,
    });

    await expect(lib.verifyPassword(passwordSample, 'SLWorld')).resolves.toBe(
      true,
    );
    await expect(lib.verifyPassword(passwordSample, 'wrong')).resolves.toBe(
      false,
    );
  });

  it('falls back to realname lookup when username misses', async () => {
    const pool = createPool([
      { sqlIncludes: 'LOWER(username)', rows: [] },
      {
        sqlIncludes: 'LOWER(realname)',
        rows: [
          {
            id: 1,
            username: 'PlayerOne',
            realname: 'playerOne',
            password: passwordSample,
            x: 0,
            y: 64,
            z: 0,
            world: 'world',
            regdate: 0,
            isLogged: 0,
            hasSession: 0,
          },
        ],
      },
    ]);
    const lib = new MysqlAuthmeLib({
      config: baseConfig,
      poolOverride: pool,
      metrics: METRICS_STUB,
    });

    const user = await lib.getByUsernameOrRealname('PlayerOne');
    expect(user).not.toBeNull();
    expect(user?.username).toBe('PlayerOne');
  });

  it('wraps pool errors into AuthmeError instances', async () => {
    const pool = createPool([]);
    (pool.query as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('connection lost'), { code: 'ECONNRESET' }),
    );
    const lib = new MysqlAuthmeLib({
      config: baseConfig,
      poolOverride: pool,
      metrics: METRICS_STUB,
    });

    await expect(lib.listAll()).rejects.toBeInstanceOf(AuthmeError);
  });
});
