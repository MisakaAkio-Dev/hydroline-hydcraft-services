-- Update rows that still use the old enum labels. Run AFTER ensure_companycategory_values.sql
UPDATE companies SET category = 'FOR_PROFIT_LEGAL_PERSONS' WHERE category = 'ENTERPRISE';
UPDATE company_types SET category = 'FOR_PROFIT_LEGAL_PERSONS' WHERE category = 'ENTERPRISE';

UPDATE companies SET category = 'NON_PROFIT_LEGAL_PERSONS' WHERE category = 'ORGANIZATION';
UPDATE company_types SET category = 'NON_PROFIT_LEGAL_PERSONS' WHERE category = 'ORGANIZATION';

-- After this completes, re-run `pnpm db:push`.