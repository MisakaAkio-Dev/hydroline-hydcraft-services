export type PortalOwnershipOverview = {
  authmeBindings: number;
  permissionGroups: number;
  rbacLabels: number;
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
