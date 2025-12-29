CREATE TABLE "transportation_railway_mtr_routes_calculate" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "railwayMod" "TransportationRailwayMod" NOT NULL DEFAULT 'MTR',
    "dimensionContext" TEXT NOT NULL,
    "dimension" TEXT,
    "routeEntityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "sourceFingerprint" TEXT NOT NULL,
    "pathSource" TEXT NOT NULL,
    "persistedSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "report" JSONB,
    "snapshot" JSONB,
    "dataset" JSONB,
    "fallbackDiagnostics" JSONB,
    "curveDiagnostics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transportation_railway_mtr_routes_calculate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_transportation_railway_route_calculate"
    ON "transportation_railway_mtr_routes_calculate" ("serverId", "railwayMod", "dimensionContext", "routeEntityId");
CREATE INDEX "idx_transportation_railway_route_calculate_scope"
    ON "transportation_railway_mtr_routes_calculate" ("serverId", "railwayMod", "dimensionContext");
