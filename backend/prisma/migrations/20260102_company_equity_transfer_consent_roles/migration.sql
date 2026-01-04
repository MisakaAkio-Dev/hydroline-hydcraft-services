-- Add new consent roles for equity transfer workflow.
-- PostgreSQL enums can only be appended; IF NOT EXISTS keeps migration idempotent.

ALTER TYPE "CompanyApplicationConsentRole"
ADD VALUE IF NOT EXISTS 'TRANSFEREE_USER';

ALTER TYPE "CompanyApplicationConsentRole"
ADD VALUE IF NOT EXISTS 'TRANSFEREE_COMPANY_LEGAL';


