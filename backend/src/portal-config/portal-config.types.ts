export interface PortalHomeBackgroundConfig {
  id: string;
  attachmentId: string;
  description?: string | null;
}

export interface PortalNavigationConfigItem {
  id: string;
  label: string;
  tooltip?: string | null;
  url?: string | null;
  available?: boolean;
  icon?: string | null;
}

export interface PortalCardVisibilityConfig {
  enabled: boolean;
  allowedRoles: string[];
  allowedUsers: string[];
  allowGuests: boolean;
}

export interface PortalHomeConfig {
  hero: {
    subtitle: string;
    backgrounds: PortalHomeBackgroundConfig[];
  };
  navigation: PortalNavigationConfigItem[];
  cards: Record<string, PortalCardVisibilityConfig>;
}

export interface PortalCardRegistryEntry {
  id: string;
  name: string;
  description?: string;
}
