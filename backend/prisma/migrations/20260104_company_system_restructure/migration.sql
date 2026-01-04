/*
  Consolidated migration for the company/LLC restructuring plus OAuth tables.
  Replaces the prior migrations that were split across 20260101_clear_company_types_data
  through 20260104_add_oauth_tables.
*/

-- 1) Clear company_types and related references to prepare for refactors
UPDATE "companies"
SET "typeId" = NULL
WHERE "typeId" IS NOT NULL;

UPDATE "company_applications"
SET "typeId" = NULL
WHERE "typeId" IS NOT NULL;

DELETE FROM "company_types";

-- 2) Company application consents + LLC structured registration tables
DO $$
BEGIN
  CREATE TYPE "CompanyApplicationConsentProgress" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CompanyApplicationConsentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CompanyApplicationConsentRole" AS ENUM (
    'LEGAL_REPRESENTATIVE',
    'SHAREHOLDER_USER',
    'SHAREHOLDER_COMPANY_LEGAL',
    'DIRECTOR',
    'CHAIRPERSON',
    'VICE_CHAIRPERSON',
    'MANAGER',
    'DEPUTY_MANAGER',
    'SUPERVISOR',
    'SUPERVISOR_CHAIRPERSON',
    'FINANCIAL_OFFICER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CompanyLlcOperatingTermType" AS ENUM ('LONG_TERM', 'YEARS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CompanyLlcShareholderKind" AS ENUM ('USER', 'COMPANY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CompanyLlcOfficerRole" AS ENUM (
    'LEGAL_REPRESENTATIVE',
    'DIRECTOR',
    'CHAIRPERSON',
    'VICE_CHAIRPERSON',
    'MANAGER',
    'DEPUTY_MANAGER',
    'SUPERVISOR',
    'SUPERVISOR_CHAIRPERSON',
    'FINANCIAL_OFFICER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "company_applications"
ADD COLUMN IF NOT EXISTS "consentStatus" "CompanyApplicationConsentProgress" NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "consentCompletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "company_application_consents" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "requiredUserId" TEXT NOT NULL,
  "role" "CompanyApplicationConsentRole" NOT NULL,
  "shareholderCompanyId" TEXT,
  "shareholderUserId" TEXT,
  "status" "CompanyApplicationConsentStatus" NOT NULL DEFAULT 'PENDING',
  "decidedAt" TIMESTAMP(3),
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_application_consents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "company_application_consents"
ADD CONSTRAINT "company_application_consents_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "company_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_application_consents"
ADD CONSTRAINT "company_application_consents_requiredUserId_fkey"
  FOREIGN KEY ("requiredUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_application_consents"
ADD CONSTRAINT "company_application_consents_shareholderCompanyId_fkey"
  FOREIGN KEY ("shareholderCompanyId") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "company_application_consents"
ADD CONSTRAINT "company_application_consents_shareholderUserId_fkey"
  FOREIGN KEY ("shareholderUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_company_application_consent_unique"
ON "company_application_consents" ("applicationId", "requiredUserId", "role", "shareholderCompanyId", "shareholderUserId");

CREATE INDEX IF NOT EXISTS "idx_company_application_consents_app_status"
ON "company_application_consents" ("applicationId", "status");

CREATE INDEX IF NOT EXISTS "idx_company_application_consents_user_status"
ON "company_application_consents" ("requiredUserId", "status");

CREATE TABLE IF NOT EXISTS "company_llc_registrations" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "domicileDivisionId" TEXT NOT NULL,
  "domicileDivisionPath" JSONB,
  "registeredCapital" INTEGER NOT NULL,
  "administrativeDivisionLevel" INTEGER NOT NULL,
  "brandName" TEXT NOT NULL,
  "industryFeature" TEXT NOT NULL,
  "registrationAuthorityName" TEXT NOT NULL,
  "domicileAddress" TEXT NOT NULL,
  "operatingTermType" "CompanyLlcOperatingTermType" NOT NULL,
  "operatingTermYears" INTEGER,
  "businessScope" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_llc_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_llc_registrations_companyId_key"
ON "company_llc_registrations" ("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "company_llc_registrations_applicationId_key"
ON "company_llc_registrations" ("applicationId");

CREATE INDEX IF NOT EXISTS "idx_company_llc_reg_company"
ON "company_llc_registrations" ("companyId");

CREATE INDEX IF NOT EXISTS "idx_company_llc_reg_application"
ON "company_llc_registrations" ("applicationId");

ALTER TABLE "company_llc_registrations"
ADD CONSTRAINT "company_llc_registrations_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_llc_registrations"
ADD CONSTRAINT "company_llc_registrations_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "company_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "company_llc_registration_shareholders" (
  "id" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "kind" "CompanyLlcShareholderKind" NOT NULL,
  "userId" TEXT,
  "companyId" TEXT,
  "ratio" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_llc_registration_shareholders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "company_llc_registration_shareholders"
ADD CONSTRAINT "company_llc_registration_shareholders_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "company_llc_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_llc_registration_shareholders"
ADD CONSTRAINT "company_llc_registration_shareholders_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "company_llc_registration_shareholders"
ADD CONSTRAINT "company_llc_registration_shareholders_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_company_llc_reg_shareholders_reg"
ON "company_llc_registration_shareholders" ("registrationId");

CREATE TABLE IF NOT EXISTS "company_llc_registration_officers" (
  "id" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "CompanyLlcOfficerRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_llc_registration_officers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "company_llc_registration_officers"
ADD CONSTRAINT "company_llc_registration_officers_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "company_llc_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_llc_registration_officers"
ADD CONSTRAINT "company_llc_registration_officers_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_company_llc_reg_officer"
ON "company_llc_registration_officers" ("registrationId", "userId", "role");

CREATE INDEX IF NOT EXISTS "idx_company_llc_reg_officers_reg"
ON "company_llc_registration_officers" ("registrationId");

CREATE INDEX IF NOT EXISTS "idx_company_llc_reg_officers_user"
ON "company_llc_registration_officers" ("userId");

-- 3) CompanyCategory enum refactor
ALTER TYPE "CompanyCategory" RENAME TO "CompanyCategory_old";

CREATE TYPE "CompanyCategory" AS ENUM (
  'FOR_PROFIT_LEGAL_PERSON',
  'NON_PROFIT_LEGAL_PERSON',
  'SPECIAL_LEGAL_PERSON',
  'UNINCORPORATED_ORGANIZATION',
  'INDIVIDUAL'
);

ALTER TABLE "company_types" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "category" DROP DEFAULT;

ALTER TABLE "company_types"
ALTER COLUMN "category" TYPE "CompanyCategory"
USING (
  CASE "category"::text
    WHEN 'ENTERPRISE' THEN 'FOR_PROFIT_LEGAL_PERSON'
    WHEN 'ORGANIZATION' THEN 'UNINCORPORATED_ORGANIZATION'
    WHEN 'INDIVIDUAL' THEN 'INDIVIDUAL'
    WHEN 'SPECIAL_LEGAL_PERSON' THEN 'SPECIAL_LEGAL_PERSON'
    WHEN 'SPECIAL_LEAGAL' THEN 'SPECIAL_LEGAL_PERSON'
    ELSE 'FOR_PROFIT_LEGAL_PERSON'
  END
)::"CompanyCategory";

ALTER TABLE "companies"
ALTER COLUMN "category" TYPE "CompanyCategory"
USING (
  CASE "category"::text
    WHEN 'ENTERPRISE' THEN 'FOR_PROFIT_LEGAL_PERSON'
    WHEN 'ORGANIZATION' THEN 'UNINCORPORATED_ORGANIZATION'
    WHEN 'INDIVIDUAL' THEN 'INDIVIDUAL'
    WHEN 'SPECIAL_LEGAL_PERSON' THEN 'SPECIAL_LEGAL_PERSON'
    WHEN 'SPECIAL_LEAGAL' THEN 'SPECIAL_LEGAL_PERSON'
    ELSE 'FOR_PROFIT_LEGAL_PERSON'
  END
)::"CompanyCategory";

ALTER TABLE "company_types" ALTER COLUMN "category" SET DEFAULT 'FOR_PROFIT_LEGAL_PERSON';
ALTER TABLE "companies" ALTER COLUMN "category" SET DEFAULT 'FOR_PROFIT_LEGAL_PERSON';

DROP TYPE "CompanyCategory_old";

-- 4) Remove legacy company isIndividualBusiness column
ALTER TABLE "companies" DROP COLUMN IF EXISTS "isIndividualBusiness";

-- 5) Add equity transfer consent roles
ALTER TYPE "CompanyApplicationConsentRole"
ADD VALUE IF NOT EXISTS 'TRANSFEREE_USER';

ALTER TYPE "CompanyApplicationConsentRole"
ADD VALUE IF NOT EXISTS 'TRANSFEREE_COMPANY_LEGAL';

-- 6) Add registration authority company reference
ALTER TABLE "company_llc_registrations"
ADD COLUMN IF NOT EXISTS "registrationAuthorityCompanyId" TEXT;

CREATE INDEX IF NOT EXISTS "idx_company_llc_reg_authority_company"
ON "company_llc_registrations" ("registrationAuthorityCompanyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_llc_registrations_registrationAuthorityCompanyId_fkey'
  ) THEN
    ALTER TABLE "company_llc_registrations"
    ADD CONSTRAINT "company_llc_registrations_registrationAuthorityCompanyId_fkey"
    FOREIGN KEY ("registrationAuthorityCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 7) Add voting ratio for LLC shareholders
ALTER TABLE "company_llc_registration_shareholders"
ADD COLUMN IF NOT EXISTS "votingRatio" DOUBLE PRECISION;

UPDATE "company_llc_registration_shareholders"
SET "votingRatio" = "ratio"
WHERE "votingRatio" IS NULL;

ALTER TABLE "company_llc_registration_shareholders"
ALTER COLUMN "votingRatio" SET NOT NULL;

-- 8) Remove legacy company member/position schema
DROP TABLE IF EXISTS "company_members" CASCADE;
DROP TABLE IF EXISTS "company_positions" CASCADE;
DROP TYPE IF EXISTS "CompanyMemberRole";

-- 9) Add administrative division tracking on companies
ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "administrativeDivisionId" TEXT;

ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "administrativeDivisionName" TEXT;

ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "administrativeDivisionLevel" INTEGER;

UPDATE "companies"
SET
  "administrativeDivisionId" = COALESCE(
    "administrativeDivisionId",
    NULLIF(("extra"->'registry'->>'domicileDivisionId'), '')
  ),
  "administrativeDivisionLevel" = COALESCE(
    "administrativeDivisionLevel",
    CASE
      WHEN ("extra"->'registry'->>'administrativeDivisionLevel') ~ '^[0-9]+$'
        THEN (("extra"->'registry'->>'administrativeDivisionLevel')::int)
      ELSE NULL
    END
  )
WHERE
  "extra" IS NOT NULL
  AND jsonb_typeof("extra") = 'object'
  AND ("extra" ? 'registry')
  AND jsonb_typeof(("extra"->'registry')) = 'object';

-- 10) Remove SUBMITTED state from company registration workflow
BEGIN;

UPDATE "workflow_instances"
SET "currentState" = 'under_review'
WHERE "definitionCode" = 'company.registration'
  AND "currentState" = 'submitted';

UPDATE "company_applications" AS a
SET
  "status" = 'UNDER_REVIEW',
  "currentStage" = 'under_review'
FROM "workflow_instances" AS i
WHERE a."workflowInstanceId" = i."id"
  AND i."definitionCode" = 'company.registration'
  AND (
    a."status" = 'SUBMITTED'
    OR a."currentStage" = 'submitted'
  );

UPDATE "workflow_definitions"
SET
  "initialState" = 'under_review',
  "states" = array_remove("states", 'submitted')
WHERE "code" = 'company.registration';

COMMIT;

-- 11) OAuth tables and metadata
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OAuthLogAction') THEN
        CREATE TYPE "OAuthLogAction" AS ENUM ('AUTHORIZE', 'TOKEN', 'LOGIN', 'REGISTER', 'BIND', 'UNBIND', 'ERROR');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OAuthLogStatus') THEN
        CREATE TYPE "OAuthLogStatus" AS ENUM ('SUCCESS', 'FAILURE');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "oauth_providers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "oauth_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "oauth_logs" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "providerKey" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "action" "OAuthLogAction" NOT NULL,
    "status" "OAuthLogStatus" NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_providers_key_key" ON "oauth_providers"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_states_state_key" ON "oauth_states"("state");
CREATE INDEX IF NOT EXISTS "idx_oauth_state_expiry" ON "oauth_states"("expiresAt");
CREATE INDEX IF NOT EXISTS "idx_oauth_log_provider_key" ON "oauth_logs"("providerKey", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_oauth_log_user" ON "oauth_logs"("userId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_logs_providerId_fkey') THEN
        ALTER TABLE "oauth_logs"
            ADD CONSTRAINT "oauth_logs_providerId_fkey"
            FOREIGN KEY ("providerId") REFERENCES "oauth_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_logs_userId_fkey') THEN
        ALTER TABLE "oauth_logs"
            ADD CONSTRAINT "oauth_logs_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_logs_accountId_fkey') THEN
        ALTER TABLE "oauth_logs"
            ADD CONSTRAINT "oauth_logs_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
