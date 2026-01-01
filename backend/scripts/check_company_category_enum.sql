-- Inspect CompanyCategory enum state + column types/defaults

SELECT
  typname AS enum_name,
  enumlabel AS enum_value,
  enumsortorder
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE typname IN ('CompanyCategory', 'CompanyCategory_old')
ORDER BY enum_name, enumsortorder;

SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('companies', 'company_types')
  AND column_name = 'category'
ORDER BY table_name;



