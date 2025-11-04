-- Add new user timeline and login metadata fields
ALTER TABLE "users" 
  ADD COLUMN IF NOT EXISTS "nameChangedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "joinDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginIp" TEXT;
