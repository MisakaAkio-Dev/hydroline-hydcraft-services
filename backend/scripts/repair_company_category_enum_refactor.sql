-- Repair for failed migration: 20260101_company_category_enum_refactor
-- Goal: make columns companies.category & company_types.category use the new "CompanyCategory" enum
-- and ensure default values are compatible, then we can mark the migration as applied.

-- 0) Ensure the new enum exists (create if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyCategory') THEN
    CREATE TYPE "CompanyCategory" AS ENUM (
      'FOR_PROFIT_LEGAL_PERSON',
      'NON_PROFIT_LEGAL_PERSON',
      'SPECIAL_LEAGAL',
      'UNINCORPORATED_ORGANIZATION',
      'INDIVIDUAL'
    );
  END IF;
END $$;

-- 1) Drop defaults first (this is what caused the original migration to fail)
ALTER TABLE "company_types" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "category" DROP DEFAULT;

-- 2) Convert column types using the same mapping
ALTER TABLE "company_types"
ALTER COLUMN "category" TYPE "CompanyCategory"
USING (
  CASE "category"::text
    WHEN 'ENTERPRISE' THEN 'FOR_PROFIT_LEGAL_PERSON'
    WHEN 'ORGANIZATION' THEN 'UNINCORPORATED_ORGANIZATION'
    WHEN 'INDIVIDUAL' THEN 'INDIVIDUAL'
    WHEN 'FOR_PROFIT_LEGAL_PERSON' THEN 'FOR_PROFIT_LEGAL_PERSON'
    WHEN 'NON_PROFIT_LEGAL_PERSON' THEN 'NON_PROFIT_LEGAL_PERSON'
    WHEN 'SPECIAL_LEAGAL' THEN 'SPECIAL_LEAGAL'
    WHEN 'UNINCORPORATED_ORGANIZATION' THEN 'UNINCORPORATED_ORGANIZATION'
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
    WHEN 'FOR_PROFIT_LEGAL_PERSON' THEN 'FOR_PROFIT_LEGAL_PERSON'
    WHEN 'NON_PROFIT_LEGAL_PERSON' THEN 'NON_PROFIT_LEGAL_PERSON'
    WHEN 'SPECIAL_LEAGAL' THEN 'SPECIAL_LEAGAL'
    WHEN 'UNINCORPORATED_ORGANIZATION' THEN 'UNINCORPORATED_ORGANIZATION'
    ELSE 'FOR_PROFIT_LEGAL_PERSON'
  END
)::"CompanyCategory";

-- 3) Restore defaults (match current Prisma schema expectations)
ALTER TABLE "company_types" ALTER COLUMN "category" SET DEFAULT 'FOR_PROFIT_LEGAL_PERSON';
ALTER TABLE "companies" ALTER COLUMN "category" SET DEFAULT 'FOR_PROFIT_LEGAL_PERSON';

-- 4) Drop old enum if present and no longer referenced
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyCategory_old') THEN
    BEGIN
      DROP TYPE "CompanyCategory_old";
    EXCEPTION
      WHEN dependent_objects_still_exist THEN
        -- still referenced somewhere; skip
        NULL;
    END;
  END IF;
END $$;






