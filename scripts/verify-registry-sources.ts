/**
 * Verify that the target-date registry's cited sources still say what its
 * weights were taken from.
 *
 * The registry stores hand-transcribed allocations, each citing a live URL.
 * Those URLs are mutable and are republished on each provider's own cadence --
 * State Street monthly -- so a citation alone does not reproduce the figure it
 * supports. This script records a fingerprint of what each source says now and
 * compares it against the fingerprint stored with the entry.
 *
 * It reports divergence. It never edits the registry: deciding that new
 * published weights should replace transcribed ones is a human judgment, and
 * an auto-updating registry would defeat the point of citing evidence.
 *
 *   npx tsx scripts/verify-registry-sources.ts
 *   npx tsx scripts/verify-registry-sources.ts --emit   # print TS to paste back
 *
 * Read-only over the network and the repo. Exits non-zero when any source has
 * drifted, so it can be wired to a schedule later.
 */

import { createHash } from 'node:crypto';
import { listRegistryEntries, type SourceFingerprint } from '../src/services/target-date-fund-registry';

const REQUEST_TIMEOUT_MS = 30_000;

/** Today in UTC, matching how the rest of the engine derives dates. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeDate(raw: string): string {
  // Providers write "Jul 31 2026", "July 31, 2026", "07/31/2026" and "06-30-26".
  const cleaned = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const slash = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1]}-${slash[2]}`;
  const dashed = cleaned.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (dashed) return `20${dashed[3]}-${dashed[1]}-${dashed[2]}`;
  const parsed = Date.parse(`${cleaned} UTC`);
  return Number.isNaN(parsed) ? cleaned : new Date(parsed).toISOString().slice(0, 10);
}

/**
 * State Street publishes allocation on a server-rendered fund page.
 *
 * Hashing the document would be useless -- the markup carries build ids and
 * timestamps that change without the figures changing -- so the fingerprint
 * covers the values actually read: the advertised holdings date and each
 * allocation line, canonicalized and sorted.
 */
async function observeStateStreet(url: string): Promise<SourceFingerprint> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  const lines = [...text.matchAll(/(Equity|Fixed Income|Alternatives|Unassigned|Cash)\s+(\d{1,3}\.\d{1,2})\s*%/gi)]
    .map(match => `${match[1].toLowerCase()}=${match[2]}`);
  const unique = [...new Set(lines)].sort();
  if (unique.length === 0) throw new Error('no allocation lines found — page structure may have changed');

  // The allocation "as of" is the latest month-end the page advertises. Pages
  // also carry a NAV date (yesterday) and a holdings date, so take month-ends
  // only and use the most recent.
  const monthEnds = [...text.matchAll(/as of\s+([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})/gi)]
    .map(match => normalizeDate(match[1]))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .filter(date => {
      const day = Number(date.slice(8, 10));
      const month = Number(date.slice(5, 7));
      const lastDay = new Date(Date.UTC(Number(date.slice(0, 4)), month, 0)).getUTCDate();
      return day === lastDay;
    })
    .sort();
  const sourceAsOf = monthEnds[monthEnds.length - 1] ?? 'unknown';

  const canonical = `${sourceAsOf}|${unique.join('|')}`;
  return {
    kind: 'published-values',
    value: sha256(canonical),
    observedAt: todayUtc(),
    sourceAsOf,
    observed: canonical,
  };
}

/** BlackRock publishes a PDF fact sheet, so the bytes themselves are evidence. */
async function observeBlackRock(url: string): Promise<SourceFingerprint> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());

  // The holdings date is rendered inside compressed content streams; reading it
  // needs a PDF toolchain this script deliberately does not depend on. The byte
  // hash is the load-bearing signal — any republication changes it.
  return {
    kind: 'document-sha256',
    value: sha256(bytes),
    observedAt: todayUtc(),
    sourceAsOf: 'see-document',
    observed: `${bytes.length} bytes`,
  };
}

const OBSERVERS: Record<string, (url: string) => Promise<SourceFingerprint>> = {
  'state-street': observeStateStreet,
  blackrock: observeBlackRock,
};

type Status = 'unchanged' | 'drifted' | 'baseline' | 'error';

(async () => {
  const emit = process.argv.includes('--emit');
  const entries = listRegistryEntries();
  const results: Array<{ key: string; status: Status; detail: string; fingerprint?: SourceFingerprint }> = [];

  for (const entry of entries) {
    const key = `${entry.identity.provider}/${entry.identity.series}/${entry.identity.vintage}`;
    const observe = OBSERVERS[entry.identity.provider];
    if (!observe) {
      results.push({ key, status: 'error', detail: `no observer for provider ${entry.identity.provider}` });
      continue;
    }
    try {
      const fingerprint = await observe(entry.sourceUrl);
      const stored = entry.sourceFingerprint;
      if (!stored) {
        results.push({ key, status: 'baseline', detail: `no stored fingerprint; observed ${fingerprint.observed}`, fingerprint });
      } else if (stored.value === fingerprint.value) {
        results.push({ key, status: 'unchanged', detail: `matches fingerprint recorded ${stored.observedAt}`, fingerprint });
      } else {
        results.push({
          key,
          status: 'drifted',
          detail: `recorded ${stored.observedAt}: ${stored.observed}\n      now:              ${fingerprint.observed}`,
          fingerprint,
        });
      }
    } catch (error) {
      results.push({ key, status: 'error', detail: error instanceof Error ? error.message : String(error) });
    }
  }

  const icon: Record<Status, string> = { unchanged: 'ok      ', drifted: 'DRIFTED ', baseline: 'baseline', error: 'ERROR   ' };
  for (const result of results) {
    console.log(`${icon[result.status]} ${result.key}`);
    console.log(`         ${result.detail}`);
    const entry = entries.find(e => `${e.identity.provider}/${e.identity.series}/${e.identity.vintage}` === result.key);
    if (result.fingerprint && entry && result.fingerprint.sourceAsOf !== 'see-document'
        && result.fingerprint.sourceAsOf !== entry.allocationAsOf) {
      console.log(`         note: source now advertises ${result.fingerprint.sourceAsOf}, entry records ${entry.allocationAsOf}`);
    }
  }

  if (emit) {
    console.log('\n// Paste into the matching registry entries. Review before committing:');
    console.log('// a changed fingerprint records that the source moved, not that the');
    console.log('// stored weights should change. Re-transcribing weights is a human call.');
    for (const result of results) {
      if (!result.fingerprint) continue;
      console.log(`\n// ${result.key}`);
      console.log(`sourceFingerprint: ${JSON.stringify(result.fingerprint, null, 2).replace(/\n/g, '\n')},`);
    }
  }

  const drifted = results.filter(r => r.status === 'drifted').length;
  const errored = results.filter(r => r.status === 'error').length;
  console.log(`\n${results.length} entries — ${results.filter(r => r.status === 'unchanged').length} unchanged, ` +
    `${drifted} drifted, ${results.filter(r => r.status === 'baseline').length} baseline, ${errored} error`);
  process.exit(drifted > 0 || errored > 0 ? 1 : 0);
})();
