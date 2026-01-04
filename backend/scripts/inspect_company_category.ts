import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const enums = await prisma.$queryRaw<
    Array<{ enum_name: string; enum_value: string; enumsortorder: number }>
  >`
    SELECT
      typname AS enum_name,
      enumlabel AS enum_value,
      enumsortorder
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE typname IN ('CompanyCategory', 'CompanyCategory_old')
    ORDER BY enum_name, enumsortorder
  `;

  const cols = await prisma.$queryRaw<
    Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      column_default: string | null;
    }>
  >`
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
    ORDER BY table_name
  `;

  console.log('CompanyCategory enums:', enums);
  console.log('category columns:', cols);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
