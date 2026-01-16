DO $$
BEGIN
  CREATE TYPE "AdministrationGovernanceMode" AS ENUM ('INHERIT', 'OVERRIDE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdministrationDivisionStatus" AS ENUM ('ACTIVE', 'UNMANAGED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdministrationDivisionManagerRole" AS ENUM ('LOCAL_ADMIN', 'LOCAL_EDITOR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "administration_regimes" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "levelCount" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "administration_regimes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "administration_regime_levels" (
  "id" TEXT NOT NULL,
  "regimeId" TEXT NOT NULL,
  "levelIndex" INTEGER NOT NULL,
  "displayName" TEXT,
  "allowOverrideGovernance" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "administration_regime_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "administration_division_types" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "suffix" TEXT NOT NULL,
  "abbrSuffix" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "administration_division_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "administration_regime_level_allowed_types" (
  "regimeLevelId" TEXT NOT NULL,
  "divisionTypeId" TEXT NOT NULL,
  CONSTRAINT "administration_regime_level_allowed_types_pkey" PRIMARY KEY ("regimeLevelId", "divisionTypeId")
);

CREATE TABLE IF NOT EXISTS "administration_governance_models" (
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "administration_governance_models_pkey" PRIMARY KEY ("code")
);

CREATE TABLE IF NOT EXISTS "administration_governance_rules" (
  "id" TEXT NOT NULL,
  "regimeId" TEXT NOT NULL,
  "appliesLevelIndex" INTEGER,
  "appliesDivisionTypeId" TEXT,
  "parentModelCode" TEXT,
  "allowedModelCode" TEXT NOT NULL,
  CONSTRAINT "administration_governance_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "administration_divisions" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "regimeId" TEXT NOT NULL,
  "levelIndex" INTEGER NOT NULL,
  "divisionTypeId" TEXT NOT NULL,
  "properName" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "abbrName" TEXT,
  "parentId" TEXT,
  "governanceMode" "AdministrationGovernanceMode" NOT NULL DEFAULT 'INHERIT',
  "governanceModelCodeEffective" TEXT,
  "status" "AdministrationDivisionStatus" NOT NULL DEFAULT 'ACTIVE',
  "pathIds" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "administration_divisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "administration_division_managers" (
  "divisionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "AdministrationDivisionManagerRole" NOT NULL DEFAULT 'LOCAL_ADMIN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "administration_division_managers_pkey" PRIMARY KEY ("divisionId", "userId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_admin_regime_level"
ON "administration_regime_levels" ("regimeId", "levelIndex");

CREATE INDEX IF NOT EXISTS "idx_admin_regime_server_active"
ON "administration_regimes" ("serverId", "isActive");

CREATE INDEX IF NOT EXISTS "idx_admin_division_type_server_sort"
ON "administration_division_types" ("serverId", "sortOrder");

CREATE INDEX IF NOT EXISTS "idx_admin_governance_rule_regime"
ON "administration_governance_rules" ("regimeId");

CREATE INDEX IF NOT EXISTS "idx_admin_division_server_parent"
ON "administration_divisions" ("serverId", "parentId");

CREATE INDEX IF NOT EXISTS "idx_admin_division_server_fullname"
ON "administration_divisions" ("serverId", "fullName");

CREATE INDEX IF NOT EXISTS "idx_admin_division_server_path"
ON "administration_divisions" ("serverId", "pathIds");

ALTER TABLE "administration_regimes"
ADD CONSTRAINT "administration_regimes_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "minecraft_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_regimes"
ADD CONSTRAINT "administration_regimes_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_regimes"
ADD CONSTRAINT "administration_regimes_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_regime_levels"
ADD CONSTRAINT "administration_regime_levels_regimeId_fkey"
  FOREIGN KEY ("regimeId") REFERENCES "administration_regimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_division_types"
ADD CONSTRAINT "administration_division_types_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "minecraft_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_regime_level_allowed_types"
ADD CONSTRAINT "administration_regime_level_allowed_types_regimeLevelId_fkey"
  FOREIGN KEY ("regimeLevelId") REFERENCES "administration_regime_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_regime_level_allowed_types"
ADD CONSTRAINT "administration_regime_level_allowed_types_divisionTypeId_fkey"
  FOREIGN KEY ("divisionTypeId") REFERENCES "administration_division_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_governance_rules"
ADD CONSTRAINT "administration_governance_rules_regimeId_fkey"
  FOREIGN KEY ("regimeId") REFERENCES "administration_regimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_governance_rules"
ADD CONSTRAINT "administration_governance_rules_appliesDivisionTypeId_fkey"
  FOREIGN KEY ("appliesDivisionTypeId") REFERENCES "administration_division_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_divisions"
ADD CONSTRAINT "administration_divisions_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "minecraft_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_divisions"
ADD CONSTRAINT "administration_divisions_regimeId_fkey"
  FOREIGN KEY ("regimeId") REFERENCES "administration_regimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_divisions"
ADD CONSTRAINT "administration_divisions_divisionTypeId_fkey"
  FOREIGN KEY ("divisionTypeId") REFERENCES "administration_division_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_divisions"
ADD CONSTRAINT "administration_divisions_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "administration_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_divisions"
ADD CONSTRAINT "administration_divisions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_divisions"
ADD CONSTRAINT "administration_divisions_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_division_managers"
ADD CONSTRAINT "administration_division_managers_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "administration_divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_division_managers"
ADD CONSTRAINT "administration_division_managers_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cleanup legacy world admin divisions KV entry (configuration bootstrap sample)
DELETE FROM "config_entries"
WHERE "key" = 'divisions_v1'
  AND "namespaceId" IN (
    SELECT "id"
    FROM "config_namespaces"
    WHERE "key" = 'world.admin_divisions'
  );
