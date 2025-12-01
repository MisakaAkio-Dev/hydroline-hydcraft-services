import type { LuckpermsGroupMembership } from '../luckperms/luckperms.interfaces';
import type { PlayerMessageReactionType } from '@prisma/client';

export type PortalOwnershipOverview = {
  authmeBindings: number;
  permissionGroups: number;
  rbacLabels: number;
};

export type PlayerSessionUser = {
  id: string;
  roles?: Array<{ role: { key: string } }>;
};

export type PlayerLoginCluster = {
  id: string;
  count: number;
  lastSeenAt: string;
  province: string | null;
  city: string | null;
  country: string | null;
  isp: string | null;
  sampleIp: string | null;
};

export type PlayerLuckpermsGroupSnapshot = LuckpermsGroupMembership & {
  displayName: string | null;
};

export type PlayerLuckpermsSnapshot = {
  authmeUsername: string;
  username: string | null;
  uuid: string | null;
  primaryGroup: string | null;
  primaryGroupDisplayName: string | null;
  groups: PlayerLuckpermsGroupSnapshot[];
  synced: boolean;
};

export type PlayerLikeSummary = {
  total: number;
  viewerLiked: boolean;
};

export type PlayerLikeDetail = {
  id: string;
  createdAt: string;
  liker: {
    id: string;
    email: string | null;
    displayName: string | null;
    primaryAuthmeUsername: string | null;
    primaryAuthmeRealname: string | null;
  };
};

export type PlayerBiographyPayload = {
  markdown: string;
  updatedAt: string;
  updatedBy: {
    id: string;
    displayName: string | null;
  } | null;
};

export type PlayerMessageBoardEntry = {
  id: string;
  author: {
    id: string;
    displayName: string | null;
    email: string | null;
  };
  content: string;
  createdAt: string;
  updatedAt: string;
  positiveCount: number;
  negativeCount: number;
  viewerReaction: PlayerMessageReactionType | null;
  viewerCanDelete: boolean;
};
