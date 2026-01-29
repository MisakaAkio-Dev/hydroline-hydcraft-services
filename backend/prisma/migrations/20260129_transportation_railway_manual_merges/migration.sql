/*
  Transportation railway manual merges (routes/stations/depots).
*/

DO $$
BEGIN
  CREATE TYPE "TransportationRailwayManualMergeEntityType" AS ENUM ('ROUTE', 'STATION', 'DEPOT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "transportation_railway_manual_merges" (
  "id" TEXT NOT NULL,
  "entityType" "TransportationRailwayManualMergeEntityType" NOT NULL,
  "name" TEXT NOT NULL,
  "englishName" TEXT,
  "color" INTEGER,
  "logoAttachmentId" TEXT,
  "serverId" TEXT NOT NULL,
  "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
  "dimensionContext" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "transportation_railway_manual_merges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_transportation_railway_manual_merge_scope"
ON "transportation_railway_manual_merges" ("entityType", "serverId", "railwayMod", "dimensionContext");

ALTER TABLE "transportation_railway_manual_merges"
ADD CONSTRAINT "transportation_railway_manual_merges_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "minecraft_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transportation_railway_manual_merges"
ADD CONSTRAINT "transportation_railway_manual_merges_logoAttachmentId_fkey"
  FOREIGN KEY ("logoAttachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transportation_railway_manual_merges"
ADD CONSTRAINT "transportation_railway_manual_merges_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transportation_railway_manual_merges"
ADD CONSTRAINT "transportation_railway_manual_merges_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "transportation_railway_manual_merge_members" (
  "id" TEXT NOT NULL,
  "mergeId" TEXT NOT NULL,
  "entityType" "TransportationRailwayManualMergeEntityType" NOT NULL,
  "serverId" TEXT NOT NULL,
  "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
  "entityId" TEXT NOT NULL,
  "dimensionContext" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transportation_railway_manual_merge_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_transportation_railway_manual_merge_member"
ON "transportation_railway_manual_merge_members" ("mergeId", "serverId", "railwayMod", "entityType", "entityId");

CREATE INDEX IF NOT EXISTS "idx_transportation_railway_manual_merge_member_lookup"
ON "transportation_railway_manual_merge_members" ("serverId", "railwayMod", "entityType", "entityId");

ALTER TABLE "transportation_railway_manual_merge_members"
ADD CONSTRAINT "transportation_railway_manual_merge_members_mergeId_fkey"
  FOREIGN KEY ("mergeId") REFERENCES "transportation_railway_manual_merges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

