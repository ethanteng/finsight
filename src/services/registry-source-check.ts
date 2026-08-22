/**
 * Re-observe the target-date registry's cited sources and classify each against
 * the fingerprint stored with its entry.
 *
 * Shared by the CLI verifier and the admin panel so both apply the same rules;
 * a check that behaves differently depending on who runs it is worse than none.
 *
 * Not reachable from the retirement analysis path, deliberately. Divergence can
 * only be established by fetching the provider, and provider fetches do not
 * belong in a request that computes someone's projection. Runtime keeps the
 * age-based `staleAllocation` flag; this is the operator's signal.
 */

import { createHash } from 'node:crypto';
import {
  listRegistryEntries,
  type SourceFingerprint,
} from './target-date-fund-registry';

const REQUEST_TIMEOUT_MS = 30_000;
/** Fact sheets and fund pages stay well under this; the cap is DoS defense. */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Today in UTC, matching how the rest of the engine derives dates. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Fetch a registry source and read its body under the same abort deadline.
 *
 * Clearing the timer when headers arrive would let a stalled body hang the
 * admin request indefinitely (the same trap `http-retry.bindTimeoutToResponse`
 * exists to prevent). Size is capped because these URLs follow redirects and
 * an unbounded `arrayBuffer`/`text` is an easy way to exhaust the process.
 */
async function fetchBodyLimited(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers.get('content-length') || '');
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`response too large (${declared} bytes)`);
    }

    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_RESPONSE_BYTES) {
        throw new Error(`response too large (${bytes.byteLength} bytes)`);
      }
      return bytes;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`response too large (>${MAX_RESPONSE_BYTES} bytes)`);
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
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
 * State Street publishes on a server-rendered fund page carrying two different
 * tables, and the distinction matters.
 *
 * "Fund Asset Allocation" gives aggregate Equity/Fixed Income for the latest
 * month-end. The registry is NOT derived from it: an equity total is unchanged
 * when the provider shifts weight between US and international, so hashing it
 * would report `unchanged` while the values feeding the simulation had moved.
 *
 * "Fund Top Holdings" lists the component portfolios and their weights, and
 * that is where every stored weight comes from. For the 2040 entry:
 *   usEquity      0.4341 = Equity 500 35.90 + Small/Mid Cap 7.51
 *   international 0.3176 = Global Equity ex-U.S. 31.76
 *   nominalBonds  0.2467 = Aggregate Bond 12.22 + Long Term Treasury 9.61
 *                          + High Yield 2.84
 *   cash          0.0016 = money market 0.17, less the documented rounding
 *
 * So the fingerprint covers the holdings lines and their own as-of date, which
 * is the publication the transcription was taken from rather than whatever the
 * page happens to summarize today.
 */
async function observeStateStreet(url: string): Promise<SourceFingerprint> {
  const bytes = await fetchBodyLimited(url);
  const html = new TextDecoder('utf-8').decode(bytes);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  const heading = text.match(/Top Holdings as of\s+([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})/i);
  if (!heading) throw new Error('no "Top Holdings as of" section — page structure may have changed');
  const sourceAsOf = normalizeDate(heading[1]);

  // The table runs from its heading to the download link that follows it.
  const start = (heading.index ?? 0) + heading[0].length;
  const rest = text.slice(start);
  const end = rest.search(/Download All Holdings|Asset Allocation/i);
  const table = end === -1 ? rest : rest.slice(0, end);

  // Holding names routinely exceed ~70 characters (e.g. State Street's
  // "Enhanced Roll Yield Commodity Strategy" ETF is 77). Cap the capture high
  // enough that a long name is read whole — a too-short limit silently starts
  // mid-name ("Street SPDR…") and leaves auditors comparing a truncated string
  // that does not appear on the page.
  const holdings = [...table.matchAll(/([A-Z][A-Za-z0-9 .,&()/'-]{4,160}?)\s+(\d{1,2}\.\d{2})\s*%/g)]
    .map(match => `${match[1].replace(/^Name Weight\s*/i, '').trim().toLowerCase()}=${match[2]}`)
    .filter(line => !/^name weight=/.test(line));
  const unique = [...new Set(holdings)].sort();
  if (unique.length === 0) throw new Error('no holdings rows parsed — page structure may have changed');

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
  const bytes = await fetchBodyLimited(url);

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

export type RegistrySourceStatus = 'unchanged' | 'drifted' | 'baseline' | 'error';

export interface RegistrySourceResult {
  /** provider/series/vintage, stable across runs. */
  key: string;
  status: RegistrySourceStatus;
  detail: string;
  sourceUrl: string;
  /** Holdings date the entry's weights were transcribed from. */
  allocationAsOf: string;
  /** Age of the stored allocation in days, as the runtime flag measures it. */
  allocationAgeDays: number;
  /** The runtime age-based flag, for contrast with observed divergence. */
  staleByAge: boolean;
  /** Date the source advertised when just observed, when it states one. */
  observedSourceAsOf?: string;
  observed?: string;
  fingerprint?: SourceFingerprint;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_ALLOCATION_DAYS = 366;

/**
 * Observe every registry source concurrently and classify each result.
 *
 * `asOfDate` exists so a caller can reproduce a past run; it only affects the
 * reported age, never what is fetched.
 */
export async function checkRegistrySources(
  asOfDate: string = todayUtc()
): Promise<RegistrySourceResult[]> {
  const entries = listRegistryEntries();

  return Promise.all(entries.map(async entry => {
    const key = `${entry.identity.provider}/${entry.identity.series}/${entry.identity.vintage}`;
    const ageDays = Math.max(0, Math.floor(
      (Date.parse(`${asOfDate}T00:00:00.000Z`) - Date.parse(`${entry.allocationAsOf}T00:00:00.000Z`)) / DAY_MS
    ));
    const base = {
      key,
      sourceUrl: entry.sourceUrl,
      allocationAsOf: entry.allocationAsOf,
      allocationAgeDays: ageDays,
      staleByAge: ageDays > STALE_ALLOCATION_DAYS,
    };

    const observe = OBSERVERS[entry.identity.provider];
    if (!observe) {
      return { ...base, status: 'error' as const, detail: `no observer for provider ${entry.identity.provider}` };
    }

    try {
      const fingerprint = await observe(entry.sourceUrl);
      const stored = entry.sourceFingerprint;
      const observedFields = {
        fingerprint,
        observed: fingerprint.observed,
        observedSourceAsOf: fingerprint.sourceAsOf,
      };

      if (!stored) {
        return { ...base, ...observedFields, status: 'baseline' as const, detail: `no stored fingerprint; observed ${fingerprint.observed}` };
      }
      if (stored.kind === 'published-values' && sha256(stored.observed) !== stored.value) {
        // Auditors read `observed`; drift detection compares `value`. A split
        // here means the registry itself is inconsistent, not that the source moved.
        return { ...base, ...observedFields, status: 'error' as const, detail: 'stored fingerprint is self-inconsistent: value !== sha256(observed)' };
      }
      if (stored.kind !== fingerprint.kind) {
        return { ...base, ...observedFields, status: 'drifted' as const, detail: `recorded kind ${stored.kind}; observer now reports ${fingerprint.kind}` };
      }
      if (stored.value === fingerprint.value) {
        return { ...base, ...observedFields, status: 'unchanged' as const, detail: `matches fingerprint recorded ${stored.observedAt}` };
      }
      return {
        ...base,
        ...observedFields,
        status: 'drifted' as const,
        detail: `recorded ${stored.observedAt}: ${stored.observed}\n      now:              ${fingerprint.observed}`,
      };
    } catch (error) {
      return { ...base, status: 'error' as const, detail: error instanceof Error ? error.message : String(error) };
    }
  }));
}

/**
 * True when a source has published something other than what an entry records.
 *
 * This is the signal `STALE_ALLOCATION_DAYS` cannot give: State Street
 * republishes monthly, so an entry stays under a 366-day threshold for a year
 * while a dozen newer publications ship. `error` is excluded on purpose — an
 * unreachable provider is an operations problem, not evidence of divergence.
 */
export function hasDiverged(result: RegistrySourceResult): boolean {
  return result.status === 'drifted';
}
