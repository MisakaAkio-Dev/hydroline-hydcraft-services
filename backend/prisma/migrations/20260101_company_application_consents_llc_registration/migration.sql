-- Company application consents + LLC structured registration tables

-- =============== Enums ===============
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

-- =============== CompanyApplication add consent fields ===============
ALTER TABLE "company_applications"
ADD COLUMN IF NOT EXISTS "consentStatus" "CompanyApplicationConsentProgress" NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "consentCompletedAt" TIMESTAMP(3);

-- =============== Consents table ===============
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

-- =============== LLC structured registration ===============
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


