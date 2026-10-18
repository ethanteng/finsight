import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'dotenv';

/*
 * The unit suite runs on several Jest workers at once, and unit/setup.ts wipes
 * the user tables before every test. Sharing one schema, one worker's wipe
 * would delete rows another worker's test had just written. So each worker
 * gets its own Postgres schema in the same database: this global setup
 * migrates one per worker, and unit-worker-env.ts points each worker's
 * DATABASE_URL at its own.
 */

const ROOT = resolve(__dirname, '../../..');

/** The database the suite was given: the environment's, else the one Prisma itself would read from .env. */
export function baseDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = resolve(ROOT, '.env');
  if (!existsSync(envFile)) return undefined;
  return parse(readFileSync(envFile)).DATABASE_URL || undefined;
}

export function workerDatabaseUrl(base: string, workerId: string | number): string {
  const url = new URL(base);
  url.searchParams.set('schema', `unit_w${workerId}`);
  return url.toString();
}

export default async function migrateWorkerSchemas(globalConfig: { maxWorkers: number }): Promise<void> {
  const base = baseDatabaseUrl();
  if (!base) return;

  for (let worker = 1; worker <= globalConfig.maxWorkers; worker++) {
    try {
      execFileSync(resolve(ROOT, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: workerDatabaseUrl(base, worker) },
        stdio: 'pipe'
      });
    } catch (error) {
      // CI always has a database, so a failure there is real. Locally the unit
      // suite has always run without one, using mocks only.
      if (process.env.CI) throw error;
      console.warn('⚠️  Could not migrate the unit test schemas; tests that need the database may fail');
      return;
    }
  }
}
