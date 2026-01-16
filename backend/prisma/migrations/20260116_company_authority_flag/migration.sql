-- Add authority flag for review-capable organizations
ALTER TABLE "companies" ADD COLUMN "isAuthority" BOOLEAN NOT NULL DEFAULT false;
