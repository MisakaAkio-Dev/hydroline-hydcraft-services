-- Store administrative division info for state organ legal person companies.
-- Required fields: division id / name / level.

ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "administrativeDivisionId" TEXT;

ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "administrativeDivisionName" TEXT;

ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "administrativeDivisionLevel" INTEGER;

-- Optional backfill from legacy extra.registry (id/level only; name is not trivially derivable in SQL).
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


