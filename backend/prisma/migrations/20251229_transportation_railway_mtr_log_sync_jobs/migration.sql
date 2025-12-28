CREATE TABLE "transportation_railway_mtr_log_sync_jobs" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "TransportationRailwaySyncStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "transportation_railway_mtr_log_sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_transportation_railway_mtr_log_sync_jobs"
    ON "transportation_railway_mtr_log_sync_jobs" ("serverId", "status");
