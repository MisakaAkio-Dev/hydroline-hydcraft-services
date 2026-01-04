SELECT
  to_regclass('public.invite_codes') AS invite_codes_table,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='invite_codes') AS column_count,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND tablename='invite_codes') AS index_count,
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema='public' AND table_name='invite_codes') AS constraint_count;

-- sample a few rows if exists (safe)
SELECT "id", "code", "createdAt", "usedAt" FROM "invite_codes" LIMIT 3;






