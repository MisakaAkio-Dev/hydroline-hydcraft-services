-- Add votingRatio to LLC registration shareholders

ALTER TABLE "company_llc_registration_shareholders"
ADD COLUMN IF NOT EXISTS "votingRatio" DOUBLE PRECISION;

-- Backfill existing rows: default votingRatio = ratio (按出资比例行使)
UPDATE "company_llc_registration_shareholders"
SET "votingRatio" = "ratio"
WHERE "votingRatio" IS NULL;

-- Make it required going forward
ALTER TABLE "company_llc_registration_shareholders"
ALTER COLUMN "votingRatio" SET NOT NULL;




