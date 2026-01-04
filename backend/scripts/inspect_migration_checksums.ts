import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>
  >`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM _prisma_migrations
    WHERE migration_name IN (
      '20251227_invite_codes',
      '20251230_invite_codes',
      '20260101_company_category_enum_refactor'
    )
    ORDER BY migration_name
  `;
  console.log(rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
