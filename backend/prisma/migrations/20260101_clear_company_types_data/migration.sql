/*
  Clear all records from company_types.

  Note:
  - company_types is referenced by:
    - companies.typeId
    - company_applications.typeId
  - These relations do not specify onDelete: Cascade, so we null out references first.
*/

-- 1) Remove references to company_types to avoid FK violations
UPDATE "companies"
SET "typeId" = NULL
WHERE "typeId" IS NOT NULL;

UPDATE "company_applications"
SET "typeId" = NULL
WHERE "typeId" IS NOT NULL;

-- 2) Clear company_types
DELETE FROM "company_types";




