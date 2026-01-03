-- Add authority company reference for LLC registration (keep name for display/compat)

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


