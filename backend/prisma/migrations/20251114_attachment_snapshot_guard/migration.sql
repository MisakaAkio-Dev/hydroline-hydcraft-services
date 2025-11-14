-- Ensure attachments table keeps uploader metadata even when owner records disappear
ALTER TABLE "attachments"
    ADD COLUMN IF NOT EXISTS "uploaderNameSnapshot" TEXT,
    ADD COLUMN IF NOT EXISTS "uploaderEmailSnapshot" TEXT;

UPDATE "attachments" AS a
SET
    "uploaderNameSnapshot" = COALESCE(a."uploaderNameSnapshot", u."name"),
    "uploaderEmailSnapshot" = COALESCE(a."uploaderEmailSnapshot", u."email")
FROM "users" AS u
WHERE a."ownerId" = u."id";

ALTER TABLE "attachments"
    DROP CONSTRAINT IF EXISTS "attachments_ownerId_fkey";

ALTER TABLE "attachments"
    ALTER COLUMN "ownerId" DROP NOT NULL;

ALTER TABLE "attachments"
    ADD CONSTRAINT "attachments_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
