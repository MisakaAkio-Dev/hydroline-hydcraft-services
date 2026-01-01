-- Idempotent repair for migration 20251227_invite_codes

CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "usedById" TEXT,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "usedById" TEXT;
ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "invite_codes_code_key" ON "invite_codes"("code");
CREATE INDEX IF NOT EXISTS "invite_codes_createdById_idx" ON "invite_codes"("createdById");
CREATE INDEX IF NOT EXISTS "invite_codes_usedById_idx" ON "invite_codes"("usedById");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invite_codes_createdById_fkey') THEN
    ALTER TABLE "invite_codes"
      ADD CONSTRAINT "invite_codes_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invite_codes_usedById_fkey') THEN
    ALTER TABLE "invite_codes"
      ADD CONSTRAINT "invite_codes_usedById_fkey"
      FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;



