/*
  Add administration organizations and public institution registrations.
*/

DO $$
BEGIN
  CREATE TYPE "AdministrationOrganizationKind" AS ENUM ('AGENCY', 'PUBLIC_INSTITUTION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdministrationOrganizationLevel" AS ENUM ('SERVER', 'LEVEL1', 'LEVEL2');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdministrationOrganizationMemberRole" AS ENUM ('MANAGER', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "administration_organizations" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "level" "AdministrationOrganizationLevel" NOT NULL DEFAULT 'SERVER',
  "divisionId" TEXT,
  "kind" "AdministrationOrganizationKind" NOT NULL DEFAULT 'AGENCY',
  "name" TEXT NOT NULL,
  "companyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "administration_organizations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_admin_org_server_kind"
ON "administration_organizations" ("serverId", "kind");

CREATE INDEX IF NOT EXISTS "idx_admin_org_division"
ON "administration_organizations" ("divisionId");

ALTER TABLE "administration_organizations"
ADD CONSTRAINT "administration_organizations_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "minecraft_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_organizations"
ADD CONSTRAINT "administration_organizations_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "administration_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_organizations"
ADD CONSTRAINT "administration_organizations_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_organizations"
ADD CONSTRAINT "administration_organizations_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "administration_organizations"
ADD CONSTRAINT "administration_organizations_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "administration_organization_members" (
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "AdministrationOrganizationMemberRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "administration_organization_members_pkey" PRIMARY KEY ("organizationId", "userId")
);

ALTER TABLE "administration_organization_members"
ADD CONSTRAINT "administration_organization_members_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "administration_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "administration_organization_members"
ADD CONSTRAINT "administration_organization_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "company_public_institution_registrations" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "domicileDivisionId" TEXT NOT NULL,
  "domicileDivisionPath" JSONB,
  "brandName" TEXT,
  "industryFeature" TEXT NOT NULL,
  "registrationAuthorityName" TEXT NOT NULL,
  "registrationAuthorityCompanyId" TEXT,
  "domicileAddress" TEXT NOT NULL,
  "operatingTermType" "CompanyLlcOperatingTermType" NOT NULL,
  "operatingTermYears" INTEGER,
  "businessScope" TEXT NOT NULL,
  "principalId" TEXT NOT NULL,
  "supervisingOrganizationId" TEXT NOT NULL,
  "supervisingCompanyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_public_institution_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_public_institution_registrations_companyId_key"
ON "company_public_institution_registrations" ("companyId");

CREATE UNIQUE INDEX IF NOT EXISTS "company_public_institution_registrations_applicationId_key"
ON "company_public_institution_registrations" ("applicationId");

CREATE INDEX IF NOT EXISTS "idx_company_public_inst_company"
ON "company_public_institution_registrations" ("companyId");

CREATE INDEX IF NOT EXISTS "idx_company_public_inst_application"
ON "company_public_institution_registrations" ("applicationId");

CREATE INDEX IF NOT EXISTS "idx_company_public_inst_org"
ON "company_public_institution_registrations" ("supervisingOrganizationId");

CREATE INDEX IF NOT EXISTS "idx_company_public_inst_authority_company"
ON "company_public_institution_registrations" ("registrationAuthorityCompanyId");

ALTER TABLE "company_public_institution_registrations"
ADD CONSTRAINT "company_public_institution_registrations_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_public_institution_registrations"
ADD CONSTRAINT "company_public_institution_registrations_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "company_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_public_institution_registrations"
ADD CONSTRAINT "company_public_institution_registrations_principalId_fkey"
  FOREIGN KEY ("principalId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_public_institution_registrations"
ADD CONSTRAINT "company_public_institution_registrations_supervisingOrganizationId_fkey"
  FOREIGN KEY ("supervisingOrganizationId") REFERENCES "administration_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_public_institution_registrations"
ADD CONSTRAINT "company_public_institution_registrations_supervisingCompanyId_fkey"
  FOREIGN KEY ("supervisingCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "company_public_institution_registrations"
ADD CONSTRAINT "company_public_institution_registrations_registrationAuthorityCompanyId_fkey"
  FOREIGN KEY ("registrationAuthorityCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
