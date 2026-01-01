import { PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      started_at: Date;
    }>
  >`SELECT migration_name, finished_at, rolled_back_at, started_at FROM _prisma_migrations ORDER BY started_at ASC`;

  console.log(`_prisma_migrations count=${rows.length}`);
  const base = join(process.cwd(), 'prisma', 'migrations');
  for (const r of rows) {
    const file = join(base, r.migration_name, 'migration.sql');
    console.log(
      `${r.migration_name} finished=${Boolean(r.finished_at)} rolledBack=${Boolean(
        r.rolled_back_at,
      )} fileExists=${existsSync(file)}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



