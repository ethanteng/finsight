/**
 * Verify that the target-date registry's cited sources still say what its
 * weights were taken from.
 *
 * The registry stores hand-transcribed allocations, each citing a live URL.
 * Those URLs are mutable and are republished on each provider's own cadence --
 * State Street monthly -- so a citation alone does not reproduce the figure it
 * supports. This reports what each source says now against the fingerprint
 * stored with the entry.
 *
 * It reports divergence. It never edits the registry: deciding that new
 * published weights should replace transcribed ones is a human judgment, and
 * an auto-updating registry would defeat the point of citing evidence.
 *
 *   npx ts-node scripts/verify-registry-sources.ts
 *   npx ts-node scripts/verify-registry-sources.ts --emit   # print TS to paste back
 *
 * Observation and classification live in `src/services/registry-source-check.ts`,
 * shared with the admin panel so a check cannot mean one thing on the command
 * line and something else in the UI.
 *
 * Read-only over the network and the repo. Exits non-zero on drift or error so
 * it can be scheduled later -- see #164, which covers making that non-blocking
 * first, since an unreachable provider is not the same as a republished one.
 */

import { checkRegistrySources, type RegistrySourceStatus } from '../src/services/registry-source-check';

const ICON: Record<RegistrySourceStatus, string> = {
  unchanged: 'ok      ',
  drifted: 'DRIFTED ',
  baseline: 'baseline',
  error: 'ERROR   ',
};

(async () => {
  const emit = process.argv.includes('--emit');
  const results = await checkRegistrySources();

  for (const result of results) {
    console.log(`${ICON[result.status]} ${result.key}`);
    console.log(`         ${result.detail}`);
    if (
      result.observedSourceAsOf &&
      result.observedSourceAsOf !== 'see-document' &&
      result.observedSourceAsOf !== result.allocationAsOf
    ) {
      console.log(`         note: source advertises ${result.observedSourceAsOf}, entry records ${result.allocationAsOf}`);
    }
    if (result.staleByAge) {
      console.log(`         note: stored allocation is ${result.allocationAgeDays} days old`);
    }
  }

  if (emit) {
    console.log('\n// Paste into the matching registry entries. Review before committing:');
    console.log('// a changed fingerprint records that the source moved, not that the');
    console.log('// stored weights should change. Re-transcribing weights is a human call.');
    for (const result of results) {
      if (!result.fingerprint) continue;
      console.log(`\n// ${result.key}`);
      console.log(`sourceFingerprint: ${JSON.stringify(result.fingerprint, null, 2)},`);
    }
  }

  const count = (status: RegistrySourceStatus) => results.filter(result => result.status === status).length;
  console.log(
    `\n${results.length} entries — ${count('unchanged')} unchanged, ${count('drifted')} drifted, ` +
    `${count('baseline')} baseline, ${count('error')} error`
  );
  process.exit(count('drifted') > 0 || count('error') > 0 ? 1 : 0);
})();
