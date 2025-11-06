export type LuckpermsHealth =
  | {
      ok: true;
      latencyMs: number;
    }
  | {
      ok: false;
      stage: 'DNS' | 'CONNECT' | 'AUTH' | 'QUERY';
      message: string;
      cause?: string;
    };

export interface LuckpermsGroupMembership {
  group: string;
  server: string | null;
  world: string | null;
  expiry: number | null;
  contexts: Record<string, string> | null;
}

export interface LuckpermsPlayer {
  uuid: string;
  username: string;
  primaryGroup: string | null;
  groups: LuckpermsGroupMembership[];
}

export interface LuckpermsLib {
  health(): Promise<LuckpermsHealth>;
  close(): Promise<void>;
  getPlayerByUsername(username: string): Promise<LuckpermsPlayer | null>;
  getPlayerByUuid(uuid: string): Promise<LuckpermsPlayer | null>;
  listPlayers(offset?: number, limit?: number): Promise<LuckpermsPlayer[]>;
}
