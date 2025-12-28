-- Rename MTR-related transportation tables to include mtr
ALTER TABLE "transportation_railway_featured_items" RENAME TO "transportation_railway_mtr_featured_items";
ALTER TABLE "transportation_railway_stations" RENAME TO "transportation_railway_mtr_stations";
ALTER TABLE "transportation_railway_platforms" RENAME TO "transportation_railway_mtr_platforms";
ALTER TABLE "transportation_railway_depots" RENAME TO "transportation_railway_mtr_depots";
ALTER TABLE "transportation_railway_company_bindings" RENAME TO "transportation_railway_mtr_company_bindings";
ALTER TABLE "transportation_railway_rails" RENAME TO "transportation_railway_mtr_rails";
ALTER TABLE "transportation_railway_signal_blocks" RENAME TO "transportation_railway_mtr_signal_blocks";
ALTER TABLE "transportation_railway_dimensions" RENAME TO "transportation_railway_mtr_dimensions";
ALTER TABLE "transportation_railway_sync_jobs" RENAME TO "transportation_railway_mtr_sync_jobs";
ALTER TABLE "transportation_railway_route_geometry_snapshots" RENAME TO "transportation_railway_mtr_route_geometry_snapshots";
ALTER TABLE "transportation_railway_station_map_snapshots" RENAME TO "transportation_railway_mtr_station_map_snapshots";
ALTER TABLE "transportation_railway_compute_scopes" RENAME TO "transportation_railway_mtr_compute_scopes";

-- New logs table for cached MTR logs
CREATE TABLE "transportation_railway_mtr_logs" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "beaconLogId" INTEGER NOT NULL,
    "timestamp" TEXT,
    "playerName" TEXT,
    "playerUuid" TEXT,
    "className" TEXT,
    "entryId" TEXT,
    "entryName" TEXT,
    "position" TEXT,
    "changeType" TEXT,
    "oldData" TEXT,
    "newData" TEXT,
    "sourceFilePath" TEXT,
    "sourceLine" INTEGER,
    "dimensionContext" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_mtr_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_mtr_log_beacon"
    ON "transportation_railway_mtr_logs" ("serverId", "beaconLogId");
CREATE INDEX "idx_transportation_railway_mtr_log_entry"
    ON "transportation_railway_mtr_logs" ("serverId", "railwayMod", "entryId");
CREATE INDEX "idx_transportation_railway_mtr_log_dimension"
    ON "transportation_railway_mtr_logs" ("serverId", "railwayMod", "dimensionContext");
CREATE INDEX "idx_transportation_railway_mtr_log_beacon"
    ON "transportation_railway_mtr_logs" ("serverId", "railwayMod", "beaconLogId");
