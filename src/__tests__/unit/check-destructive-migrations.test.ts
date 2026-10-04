import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join, resolve } from 'path';

// scripts/check-destructive-migrations.sh is the only thing standing between a
// destructive migration and production: migrate-prod applies with no approval
// step. These cases pin what it must catch and what it must leave alone.

const SCRIPT = resolve(__dirname, '../../../scripts/check-destructive-migrations.sh');

describe('check-destructive-migrations.sh', () => {
  let root: string;
  let counter = 0;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'destructive-migrations-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function migration(sql: string): string {
    counter += 1;
    const dir = join(root, `2099010100000${counter}_fixture`);
    mkdirSync(dir);
    writeFileSync(join(dir, 'migration.sql'), sql);
    return dir;
  }

  function check(...dirs: string[]) {
    const result = spawnSync('bash', [SCRIPT, ...dirs], { encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }

  it('passes when there is nothing to check', () => {
    expect(check().status).toBe(0);
  });

  it('passes additive migrations', () => {
    const dir = migration(
      'CREATE TABLE "Thing" ("id" TEXT NOT NULL);\n' +
        'ALTER TABLE "users" ADD COLUMN "nickname" TEXT;\n' +
        'CREATE INDEX "Thing_id_idx" ON "Thing"("id");\n'
    );
    expect(check(dir).status).toBe(0);
  });

  it.each([
    ['DROP CONSTRAINT', 'ALTER TABLE "Thing" DROP CONSTRAINT "Thing_userId_fkey";'],
    ['DROP INDEX', 'DROP INDEX "Thing_id_idx";'],
    ['DROP DEFAULT', 'ALTER TABLE "Thing" ALTER COLUMN "updatedAt" DROP DEFAULT;'],
    ['DROP NOT NULL', 'ALTER TABLE "Thing" ALTER COLUMN "name" DROP NOT NULL;'],
  ])('does not flag %s, which loses no data', (_label, sql) => {
    expect(check(migration(sql)).status).toBe(0);
  });

  it("ignores Prisma's warnings block and commented-out statements", () => {
    const dir = migration(
      '/*\n  Warnings:\n\n  - You are about to drop the column `x` on the `users` table.\n*/\n' +
        '-- DROP TABLE "users";\n' +
        'CREATE TABLE "Thing" ("id" TEXT NOT NULL);\n'
    );
    expect(check(dir).status).toBe(0);
  });

  it.each([
    ['DROP TABLE', 'DROP TABLE "Thing";'],
    ['DROP TABLE IF EXISTS', 'DROP TABLE IF EXISTS "Thing";'],
    ['DROP COLUMN', 'ALTER TABLE "users" DROP COLUMN "nickname";'],
    ['DROP COLUMN across lines', 'ALTER TABLE "users"\n  DROP\n  COLUMN "nickname";'],
    ['column drop without COLUMN', 'ALTER TABLE "users" DROP "nickname";'],
    ['DROP TYPE', 'DROP TYPE "Role_old";'],
    ['DROP SCHEMA', 'DROP SCHEMA "archive" CASCADE;'],
    ['SET DATA TYPE', 'ALTER TABLE "users" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);'],
    ['ALTER COLUMN TYPE', 'ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");'],
    ['TRUNCATE', 'TRUNCATE "Thing";'],
    ['DELETE FROM', 'DELETE FROM "Thing" WHERE "id" = \'x\';'],
    ['lower-case SQL', 'alter table users drop column nickname;'],
  ])('blocks %s without an opt-in', (_label, sql) => {
    const { status, output } = check(migration(sql));
    expect(status).toBe(1);
    expect(output).toContain('destructive SQL without an opt-in');
    expect(output).toContain('-- allow-destructive:');
  });

  it('allows destructive SQL when the migration opts in with a reason', () => {
    const dir = migration(
      '-- allow-destructive: nickname was never populated\n' +
        'ALTER TABLE "users" DROP COLUMN "nickname";\n'
    );
    const { status, output } = check(dir);
    expect(status).toBe(0);
    expect(output).toContain('allowed by opt-in');
    expect(output).toContain('nickname was never populated');
  });

  it('does not accept an opt-in with no reason', () => {
    const dir = migration('-- allow-destructive:\nDROP TABLE "Thing";\n');
    expect(check(dir).status).toBe(1);
  });

  it('fails the whole check when any one migration is blocked', () => {
    const safe = migration('CREATE TABLE "Thing" ("id" TEXT NOT NULL);');
    const unsafe = migration('DROP TABLE "Other";');
    const { status, output } = check(safe, unsafe);
    expect(status).toBe(1);
    expect(output).toContain(`✅ ${basename(safe)}`);
    expect(output).toContain(`❌ ${basename(unsafe)}`);
  });

  it('fails closed when a migration directory has no migration.sql', () => {
    const dir = join(root, '20990101000099_empty');
    mkdirSync(dir);
    const { status, output } = check(dir);
    expect(status).toBe(1);
    expect(output).toContain('no migration.sql');
  });
});
