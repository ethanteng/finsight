import { baseDatabaseUrl, workerDatabaseUrl } from './unit-worker-database';

// Runs in each worker before every unit test file, before anything creates a
// Prisma client: each worker uses its own schema (see unit-worker-database.ts).
const base = baseDatabaseUrl();
if (base && process.env.JEST_WORKER_ID) {
  process.env.DATABASE_URL = workerDatabaseUrl(base, process.env.JEST_WORKER_ID);
}
