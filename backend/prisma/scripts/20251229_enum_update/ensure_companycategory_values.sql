-- Ensure the desired enum labels exist on the PostgreSQL enum type CompanyCategory.
-- Run this first. It only adds values and is safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'companycategory' AND e.enumlabel = 'FOR_PROFIT_LEGAL_PERSONS'
  ) THEN
    EXECUTE 'ALTER TYPE "CompanyCategory" ADD VALUE ''FOR_PROFIT_LEGAL_PERSONS''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'companycategory' AND e.enumlabel = 'NON_PROFIT_LEGAL_PERSONS'
  ) THEN
    EXECUTE 'ALTER TYPE "CompanyCategory" ADD VALUE ''NON_PROFIT_LEGAL_PERSONS''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'companycategory' AND e.enumlabel = 'SPECIAL_LEGAL_PERSONS'
  ) THEN
    EXECUTE 'ALTER TYPE "CompanyCategory" ADD VALUE ''SPECIAL_LEGAL_PERSONS''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'companycategory' AND e.enumlabel = 'UNINCORPORATED_ORGANIZATIONS'
  ) THEN
    EXECUTE 'ALTER TYPE "CompanyCategory" ADD VALUE ''UNINCORPORATED_ORGANIZATIONS''';
  END IF;
END
$$;

-- Note: Execute this file first, then run the update script.