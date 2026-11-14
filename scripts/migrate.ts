import { runMigrations } from '../src/db/migrate.js';
import { closePool, dbEnabled } from '../src/db/pool.js';

async function main() {
  if (!dbEnabled) throw new Error('DATABASE_URL is not set');
  console.log('Running migrations...');
  await runMigrations();
  console.log('Migrations completed successfully.');
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
