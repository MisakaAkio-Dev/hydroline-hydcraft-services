// 使用 CommonJS 形式加载 socket.io-client，以兼容 v2 的导出结构
// eslint-disable-next-line @typescript-eslint/no-var-requires
const socketIo =
  require('socket.io-client') as typeof import('socket.io-client');

export type HydrolineBeaconEvent =
  | 'force_update'
  | 'get_player_advancements'
  | 'get_player_stats'
  | 'list_online_players'
  | 'get_server_time'
  | 'get_player_mtr_logs'
  | 'get_mtr_log_detail'
  | 'get_player_sessions'
  | 'get_status'
  | 'get_player_nbt'
  | 'lookup_player_identity';

export interface HydrolineBeaconClientOptions {
  endpoint: string;
  key: string;
  timeoutMs?: number;
  maxRetry?: number;
}

export interface EmitOptions {
  timeoutMs?: number;
}

type Socket = ReturnType<typeof socketIo>;

export class HydrolineBeaconClient {
  private socket: Socket | null = null;
  private connecting = false;

  constructor(private readonly options: HydrolineBeaconClientOptions) {}

  private ensureSocket(): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }
    if (this.connecting && this.socket) {
      return this.socket;
    }
    this.connecting = true;
    const socket = socketIo(this.options.endpoint, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.options.maxRetry ?? 3,
      timeout: this.options.timeoutMs ?? 10000,
    });
    this.socket = socket;
    socket.on('connect', () => {
      this.connecting = false;
    });
    socket.on('disconnect', () => {
      this.connecting = false;
    });
    socket.on('connect_error', (err: Error) => {
      void err;
    });
    socket.on('error', (err: unknown) => {
      void err;
    });
    return socket;
  }

  async emit<TResponse = unknown>(
    event: HydrolineBeaconEvent,
    payload: Record<string, unknown>,
    options?: EmitOptions,
  ): Promise<TResponse> {
    const socket = this.ensureSocket();
    const body = {
      ...payload,
      key: this.options.key,
    };
    const timeoutMs = options?.timeoutMs ?? this.options.timeoutMs ?? 10000;
    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${event} ack timeout`));
      }, timeoutMs);

      socket.emit(event, body, (response: TResponse) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connecting = false;
    }
  }
}
