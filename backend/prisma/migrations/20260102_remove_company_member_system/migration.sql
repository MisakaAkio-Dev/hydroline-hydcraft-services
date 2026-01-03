-- Remove legacy company member/position role system.
-- We keep the LLC registration system (shareholders/officers) as the only personnel model.

DROP TABLE IF EXISTS "company_members" CASCADE;
DROP TABLE IF EXISTS "company_positions" CASCADE;

-- Prisma enum type name in PostgreSQL uses the same name as the schema enum.
DROP TYPE IF EXISTS "CompanyMemberRole";


