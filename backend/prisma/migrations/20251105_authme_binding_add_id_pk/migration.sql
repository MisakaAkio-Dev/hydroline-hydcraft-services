-- Transition user_authme_binding from 1:1 (PK on user_id) to 1:N (PK on id)
-- 1) Add nullable id column (TEXT)
ALTER TABLE "user_authme_binding" ADD COLUMN "id" TEXT;

-- 2) Backfill id for existing rows with a unique value (32-hex) using built-in md5()
UPDATE "user_authme_binding"
SET "id" = md5(random()::text || clock_timestamp()::text)
WHERE "id" IS NULL;

-- 3) Drop old primary key on user_id
ALTER TABLE "user_authme_binding" DROP CONSTRAINT IF EXISTS "user_authme_binding_pkey";

-- 4) Set id as NOT NULL and new primary key
ALTER TABLE "user_authme_binding" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "user_authme_binding" ADD CONSTRAINT "user_authme_binding_pkey" PRIMARY KEY ("id");

-- Note: keep unique index on authme_username_lower to prevent duplicates across users
