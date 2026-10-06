/**
 * Persistence for registry publications applied from the admin panel.
 *
 * The registry's lookup is synchronous and runs deep inside the retirement
 * engine, so applied rows are mirrored into memory the way the prompt config
 * is: `ensureAppliedRegistryEntries()` refreshes on a short TTL before an
 * analysis, and the admin endpoints `refreshAppliedRegistryEntries()` so an
 * operator never looks at a check made against a stale copy.
 *
 * Every row is re-validated on load. A row that fails is left out and logged,
 * because the alternative is a hand-edited database row feeding someone's
 * projection with weights nothing checked.
 */

import { createHash } from 'node:crypto';
import { getPrismaClient } from '../prisma-client';
import {
  listCurrentRegistryEntries,
  setAppliedRegistryEntries,
  type RegistryEntry,
  type SourceFingerprint,
} from './target-date-fund-registry';
import { checkRegistrySources, registryEntryKey } from './registry-source-check';
import { proposeRegistryUpdate } from './registry-source-update';

const CACHE_TTL_MS = 60_000;
let loadedAt = 0;

const SERIES_BY_PROVIDER: Record<string, string> = {
  'state-street': 'target-retirement',
  blackrock: 'lifepath-index',
  uc: 'pathway',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface PublicationRow {
  id: string;
  provider: string;
  series: string;
  vintage: number;
  allocationAsOf: string;
  availableFrom: string;
  sourceUrl: string;
  sourceContext: string;
  exactAllocation: boolean;
  tipsAllocationStatus: string;
  weights: unknown;
  sourceFingerprint: unknown;
  fingerprintValue: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The row as a registry entry, or why it cannot be one. */
export function publicationToEntry(row: PublicationRow): RegistryEntry | string {
  if (SERIES_BY_PROVIDER[row.provider] !== row.series) return `unknown identity ${row.provider}/${row.series}`;
  if (!Number.isInteger(row.vintage)) return `vintage ${row.vintage} is not a year`;
  if (!ISO_DATE.test(row.allocationAsOf) || !ISO_DATE.test(row.availableFrom)) return 'dates are not YYYY-MM-DD';
  // The source check fetches this, so a row cannot aim it anywhere but a public page.
  if (!/^https:\/\/[^/]+\.[a-z]{2,}\//i.test(row.sourceUrl)) return 'sourceUrl is not an https page';
  if (row.tipsAllocationStatus !== 'exact' && row.tipsAllocationStatus !== 'lower-bound') {
    return `tipsAllocationStatus ${row.tipsAllocationStatus}`;
  }

  if (!isRecord(row.weights)) return 'weights are not an object';
  const sleeves = ['usEquity', 'internationalEquity', 'nominalBonds', 'tips', 'cash'] as const;
  const weights = {} as RegistryEntry['weights'];
  for (const sleeve of sleeves) {
    const value = row.weights[sleeve];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      return `weight ${sleeve} is not a fraction`;
    }
    weights[sleeve] = value;
  }
  // A ten-thousandth of slack for representation; anything more creates value.
  if (sleeves.reduce((total, sleeve) => total + weights[sleeve], 0) > 1.0001) return 'weights total more than 1';

  const fingerprint = row.sourceFingerprint;
  if (!isRecord(fingerprint)) return 'sourceFingerprint is not an object';
  const { kind, value, observedAt, sourceAsOf, observed } = fingerprint;
  if (kind !== 'published-values' && kind !== 'document-sha256') return `fingerprint kind ${String(kind)}`;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value) || value !== row.fingerprintValue) {
    return 'fingerprint value is not the sha256 the row is keyed by';
  }
  if (typeof observedAt !== 'string' || !ISO_DATE.test(observedAt)) return 'fingerprint observedAt is not a date';
  if (typeof sourceAsOf !== 'string' || typeof observed !== 'string') return 'fingerprint is incomplete';
  // The same invariants the provenance tests hold the code rows to.
  if (observedAt < row.allocationAsOf) return 'observed before the holdings date it attests to';
  if (kind === 'published-values') {
    if (createHash('sha256').update(observed).digest('hex') !== value) return 'value !== sha256(observed)';
    if (sourceAsOf !== row.allocationAsOf) return 'fingerprint attests to a different publication than the weights';
  }

  return {
    identity: { provider: row.provider, series: row.series, vintage: row.vintage } as RegistryEntry['identity'],
    allocationAsOf: row.allocationAsOf,
    availableFrom: row.availableFrom,
    sourceUrl: row.sourceUrl,
    sourceContext: row.sourceContext,
    exactAllocation: row.exactAllocation,
    tipsAllocationStatus: row.tipsAllocationStatus,
    sourceFingerprint: { kind, value, observedAt, sourceAsOf, observed } as SourceFingerprint,
    weights,
  };
}

/**
 * Load every applied row into the registry now. Throws when the database
 * cannot be read, so a caller that is about to report on the registry does
 * not report on the code rows alone as if nothing had been applied.
 */
export async function refreshAppliedRegistryEntries(): Promise<void> {
  const rows = await getPrismaClient().targetDateRegistryPublication.findMany({
    orderBy: { createdAt: 'asc' },
  });
  const entries: RegistryEntry[] = [];
  for (const row of rows) {
    const entry = publicationToEntry(row);
    if (typeof entry === 'string') {
      console.error(`Registry publication ${row.id} left out: ${entry}`);
      continue;
    }
    entries.push(entry);
  }
  setAppliedRegistryEntries(entries);
  loadedAt = Date.now();
}

/**
 * Refresh on a short TTL. Never throws: an unreachable database keeps the last
 * copy loaded (or the code rows alone), which is what every analysis used
 * before applied rows existed.
 */
export async function ensureAppliedRegistryEntries(): Promise<void> {
  if (Date.now() - loadedAt < CACHE_TTL_MS) return;
  try {
    await refreshAppliedRegistryEntries();
  } catch (error) {
    // Retry after the TTL rather than on every analysis while the outage lasts.
    loadedAt = Date.now();
    console.warn('Failed to load applied registry publications; using the last copy loaded:', error);
  }
}

/** Reset the in-memory copy. Intended for tests. */
export function resetAppliedRegistryCache(): void {
  setAppliedRegistryEntries([]);
  loadedAt = 0;
}

/** One entry the operator approved, pinned to the observation they saw. */
export interface RegistryUpdateApproval {
  key: string;
  observedValue: string;
}

export interface RegistryUpdateOutcome {
  key: string;
  outcome: 'applied' | 'already-applied' | 'changed' | 'not-drifted' | 'refused';
  detail: string;
}

/**
 * Apply the approved entries' current publications.
 *
 * Each source is observed again here rather than trusting anything the client
 * sends, and an approval only applies when that fresh observation is the one
 * the operator approved. A provider republishing between the check and the
 * click is reported as `changed`, so a click never records a publication
 * nobody looked at.
 */
export async function applyRegistryUpdates(
  approvals: RegistryUpdateApproval[],
  appliedBy: string,
): Promise<RegistryUpdateOutcome[]> {
  await refreshAppliedRegistryEntries();
  const results = await checkRegistrySources();
  const current = listCurrentRegistryEntries();
  const prisma = getPrismaClient();
  const outcomes: RegistryUpdateOutcome[] = [];

  for (const approval of approvals) {
    const result = results.find(candidate => candidate.key === approval.key);
    const entry = current.find(candidate => registryEntryKey(candidate) === approval.key);
    if (!result || !entry) {
      outcomes.push({ key: approval.key, outcome: 'refused', detail: 'no registry entry has this key' });
      continue;
    }
    if (result.status !== 'drifted' || !result.fingerprint) {
      outcomes.push({
        key: approval.key,
        outcome: 'not-drifted',
        detail: result.status === 'unchanged'
          ? 'the entry already matches its source'
          : `the source is ${result.status === 'error' ? 'unreadable' : result.status} now: ${result.detail}`,
      });
      continue;
    }
    if (result.fingerprint.value !== approval.observedValue) {
      outcomes.push({
        key: approval.key,
        outcome: 'changed',
        detail: 'the source has published again since it was checked; re-check and review it before updating',
      });
      continue;
    }

    const proposal = proposeRegistryUpdate(entry, result.fingerprint);
    if (!proposal.applicable) {
      outcomes.push({ key: approval.key, outcome: 'refused', detail: proposal.reason });
      continue;
    }

    const next = proposal.entry;
    const created = await prisma.targetDateRegistryPublication.createMany({
      data: [{
        provider: next.identity.provider,
        series: next.identity.series,
        vintage: next.identity.vintage,
        allocationAsOf: next.allocationAsOf,
        availableFrom: next.availableFrom,
        sourceUrl: next.sourceUrl,
        sourceContext: next.sourceContext,
        exactAllocation: next.exactAllocation,
        tipsAllocationStatus: next.tipsAllocationStatus,
        weights: next.weights,
        sourceFingerprint: { ...next.sourceFingerprint },
        fingerprintValue: next.sourceFingerprint.value,
        derivation: proposal.derivation,
        appliedBy,
      }],
      // Two operators clicking at once record the publication once.
      skipDuplicates: true,
    });
    outcomes.push(created.count === 1
      ? { key: approval.key, outcome: 'applied', detail: `holdings as of ${next.allocationAsOf}, available from ${next.availableFrom}` }
      : { key: approval.key, outcome: 'already-applied', detail: 'this publication was already recorded' });
  }

  await refreshAppliedRegistryEntries();
  return outcomes;
}
