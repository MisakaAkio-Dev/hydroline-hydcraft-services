export interface PortalNavigationLink {
  id: string;
  label: string;
  tooltip: string;
  url: string | null;
  available: boolean;
}

export interface PortalMinecraftProfile {
  id: string;
  minecraftId: string;
  nickname?: string | null;
}

export interface PortalRole {
  id: string;
  key: string;
  name: string;
}

export interface PortalAttachmentTag {
  id: string;
  key: string;
  name: string;
}

export interface PortalUserSnapshot {
  id: string;
  email: string;
  name: string | null | undefined;
  displayName: string | null | undefined;
  piic: string | null;
  createdAt: string;
  roles: PortalRole[];
  primaryMinecraft: PortalMinecraftProfile | null;
  avatarUrl: string | null;
}

export type PortalHomeCard =
  | {
      id: string;
      kind: 'profile';
      title: string;
      status: 'active' | 'requires-auth';
      payload?: {
        displayName: string | null | undefined;
        email: string;
        piic: string | null;
        minecraft: PortalMinecraftProfile | null;
        roles: PortalRole[];
        avatarUrl: string | null;
        joinedAt: string;
      };
    }
  | {
      id: string;
      kind: 'placeholder';
      title: string;
      status: 'locked';
    };

export interface PortalHomeData {
  hero: {
    title: string;
    subtitle: string;
    background: {
      imageUrl: string | null;
      description: string | null;
    } | null;
  };
  header: {
    idleTitle: string;
    activeTitle: string;
  };
  navigation: PortalNavigationLink[];
  cards: PortalHomeCard[];
  user: PortalUserSnapshot | null;
  theme: {
    modes: Array<'light' | 'dark' | 'system'>;
    defaultMode: 'light' | 'dark' | 'system';
  };
  messages: unknown[];
}

export interface AdminOverviewUser {
  id: string;
  email: string;
  name: string | null | undefined;
  createdAt: string;
  profile: {
    displayName: string | null;
    piic: string | null;
    primaryMinecraft: PortalMinecraftProfile | null;
  } | null;
  minecraftProfiles: Array<PortalMinecraftProfile & { isPrimary: boolean }>;
  roles: PortalRole[];
}

export interface AdminOverviewData {
  users: AdminOverviewUser[];
  attachments: {
    total: number;
    recent: Array<{
      id: string;
      name: string;
      isPublic: boolean;
      size: number;
      createdAt: string;
      owner: {
        id: string;
        name: string | null | undefined;
        email: string;
      };
      folder: {
        id: string;
        name: string;
        path: string;
      } | null;
      tags: PortalAttachmentTag[];
      publicUrl: string | null;
    }>;
  };
  unlinkedPlayers: PortalMinecraftProfile[];
}
