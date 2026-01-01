/*
  CompanyCategory enum refactor

  Old values:
    - ENTERPRISE
    - INDIVIDUAL
    - ORGANIZATION

  New values:
    - FOR_PROFIT_LEGAL_PERSON
    - NON_PROFIT_LEGAL_PERSON
    - SPECIAL_LEAGAL
    - UNINCORPORATED_ORGANIZATION
    - INDIVIDUAL

  Mapping:
    ENTERPRISE    -> FOR_PROFIT_LEGAL_PERSON
    ORGANIZATION  -> UNINCORPORATED_ORGANIZATION
    INDIVIDUAL    -> INDIVIDUAL
*/

-- 1) Rename old enum type
ALTER TYPE "CompanyCategory" RENAME TO "CompanyCategory_old";

-- 2) Create new enum type
CREATE TYPE "CompanyCategory" AS ENUM (
  'FOR_PROFIT_LEGAL_PERSON',
  'NON_PROFIT_LEGAL_PERSON',
  'SPECIAL_LEAGAL',
  'UNINCORPORATED_ORGANIZATION',
  'INDIVIDUAL'
);

-- 3) Migrate columns using the enum
-- IMPORTANT: drop defaults first, otherwise Postgres may fail casting the old default to the new enum type
ALTER TABLE "company_types" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "category" DROP DEFAULT;

ALTER TABLE "company_types"
ALTER COLUMN "category" TYPE "CompanyCategory"
USING (
  CASE "category"::text
    WHEN 'ENTERPRISE' THEN 'FOR_PROFIT_LEGAL_PERSON'
    WHEN 'ORGANIZATION' THEN 'UNINCORPORATED_ORGANIZATION'
    WHEN 'INDIVIDUAL' THEN 'INDIVIDUAL'
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
    ELSE 'FOR_PROFIT_LEGAL_PERSON'
  END
)::"CompanyCategory";

-- Restore defaults (Prisma expects FOR_PROFIT_LEGAL_PERSON as default)
ALTER TABLE "company_types" ALTER COLUMN "category" SET DEFAULT 'FOR_PROFIT_LEGAL_PERSON';
ALTER TABLE "companies" ALTER COLUMN "category" SET DEFAULT 'FOR_PROFIT_LEGAL_PERSON';

-- 4) Drop old enum type
DROP TYPE "CompanyCategory_old";


