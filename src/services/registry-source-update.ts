/**
 * Turn a source's current publication into a new registry row, for the admin
 * panel's Update button.
 *
 * Re-transcribing a State Street entry is mechanical once the holdings table
 * has been read: each published holding goes to one sleeve, credit and real
 * assets are left out, and the cash line absorbs rounding. The fingerprint's
 * `observed` string *is* that table, so the weights here are a pure function
 * of the evidence the new row records. They cannot drift apart, which is the
 * state hand edits could reach: a fingerprint re-baselined while the weights
 * stayed as they were.
 *
 * What stays a human call is anything the rules below do not already cover. A
 * holding this file has never seen, a table that no longer adds up to the
 * whole fund, or a PDF whose holdings this codebase cannot read all refuse,
 * with the reason, rather than guess. Whether to apply a publication at all is
 * the operator's decision; the button is where that decision is made.
 *
 * Pure: no fetch, no database. `target-date-registry-store.ts` observes and
 * persists.
 */

import { createHash } from 'node:crypto';
import type { RegistryEntry, SourceFingerprint } from './target-date-fund-registry';

type Sleeve = keyof RegistryEntry['weights'];

/** Why a published holding is left out of the simulated weights. */
type Exclusion = 'credit' | 'commodities' | 'real estate';

/**
 * Every State Street holding the registry has transcribed, and where each
 * goes. Names are exactly as the observer records them (lowercased).
 *
 * Exact names, not patterns: a renamed or new holding is the case a person
 * should look at, because the mapper's sleeve for the instrument has to be
 * confirmed before its weight feeds a projection. Adding a line here is that
 * confirmation.
 *
 * The placements are the ones already in the registry's hand transcriptions,
 * including the reasoning recorded there: high yield and corporate credit are
 * excluded rather than modeled as government bonds (they fall with equity
 * when Treasuries rally), and commodities and real estate have no sleeve.
 */
const STATE_STREET_HOLDINGS: Record<string, Sleeve | { excluded: Exclusion }> = {
  'state street equity 500 index ii portfolio': 'usEquity',
  'state street small/mid cap equity index portfolio': 'usEquity',
  'state street global equity ex-u.s. index portfolio': 'internationalEquity',
  'state street aggregate bond index portfolio': 'nominalBonds',
  'state street spdr portfolio long term treasury etf': 'nominalBonds',
  'state street spdr portfolio short term treasury etf': 'nominalBonds',
  'state street spdr bloomberg 1-10 year tips etf': 'tips',
  'ssi us gov money market class': 'cash',
  'u.s. dollar': 'cash',
  'state street spdr bloomberg high yield bond etf': { excluded: 'credit' },
  'state street spdr portfolio short term corporate bond etf': { excluded: 'credit' },
  'state street spdr bloomberg enhanced roll yield commodity strategy no k-1 etf': { excluded: 'commodities' },
  'state street spdr dow jones global real estate etf': { excluded: 'real estate' },
};

/**
 * How far the published lines may total from 100%, in basis points.
 *
 * Rounded lines miss by a few hundredths (the 2030 table totals 100.11%). A
 * table well short of the whole fund is more likely a top-holdings extract
 * than rounding, and its weights would understate every sleeve.
 */
const TOTAL_TOLERANCE_BPS = 25;

export type DerivedWeights =
  | { ok: true; weights: RegistryEntry['weights']; derivation: string[] }
  | { ok: false; reason: string };

function formatBps(bps: number): string {
  return (bps / 100).toFixed(2);
}

function fraction(bps: number): number {
  return Math.round(bps) / 10_000;
}

/**
 * Weights from a State Street `published-values` observation.
 *
 * Cash is the money-market line plus any U.S.-dollar balance, less whatever
 * the rounded lines total above 100%, so modeled weights never create value.
 * That is the rule every existing State Street row was transcribed under; a
 * test derives each of them from its own fingerprint to keep it so.
 */
export function deriveStateStreetWeights(observed: string): DerivedWeights {
  const [, ...lines] = observed.split('|');
  if (lines.length === 0) return { ok: false, reason: 'the observation lists no holdings' };

  const bySleeve: Record<Sleeve, Array<{ name: string; bps: number }>> = {
    usEquity: [], internationalEquity: [], nominalBonds: [], tips: [], cash: [],
  };
  const excluded: Array<{ name: string; bps: number; why: Exclusion }> = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  let totalBps = 0;

  for (const line of lines) {
    const match = line.match(/^(.+)=(\d{1,2})\.(\d{2})$/);
    if (!match) return { ok: false, reason: `unreadable holding line "${line}"` };
    const [, name, whole, hundredths] = match;
    if (seen.has(name)) return { ok: false, reason: `"${name}" is listed twice` };
    seen.add(name);

    const bps = Number(whole) * 100 + Number(hundredths);
    totalBps += bps;
    const placement = STATE_STREET_HOLDINGS[name];
    if (placement === undefined) unknown.push(name);
    else if (typeof placement === 'string') bySleeve[placement].push({ name, bps });
    else excluded.push({ name, bps, why: placement.excluded });
  }

  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `no sleeve is assigned to ${unknown.map(name => `"${name}"`).join(', ')}; ` +
        'transcribe by hand, or add the holding to the State Street map in registry-source-update.ts',
    };
  }
  if (Math.abs(totalBps - 10_000) > TOTAL_TOLERANCE_BPS) {
    return {
      ok: false,
      reason: `the published lines total ${formatBps(totalBps)}%, so the table is not the whole fund`,
    };
  }

  const sum = (rows: Array<{ bps: number }>) => rows.reduce((total, row) => total + row.bps, 0);
  const roundingBps = Math.max(0, totalBps - 10_000);
  const cashBps = sum(bySleeve.cash) - roundingBps;
  if (cashBps < 0) {
    return {
      ok: false,
      reason: `the lines total ${formatBps(totalBps)}% and the cash line is too small to absorb the rounding`,
    };
  }

  const sleeveBps: Record<Sleeve, number> = {
    usEquity: sum(bySleeve.usEquity),
    internationalEquity: sum(bySleeve.internationalEquity),
    nominalBonds: sum(bySleeve.nominalBonds),
    tips: sum(bySleeve.tips),
    cash: cashBps,
  };

  const derivation = (Object.keys(sleeveBps) as Sleeve[]).map(sleeve => {
    const parts = bySleeve[sleeve].map(row => `${row.name} ${formatBps(row.bps)}`);
    let source = parts.length ? parts.join(' + ') : 'none published';
    if (sleeve === 'cash' && roundingBps > 0) {
      source += ` - ${formatBps(roundingBps)} rounding (lines total ${formatBps(totalBps)}%)`;
    }
    return `${sleeve} ${fraction(sleeveBps[sleeve]).toFixed(4)} = ${source}`;
  });
  for (const row of excluded) {
    derivation.push(`excluded (${row.why}): ${row.name} ${formatBps(row.bps)}`);
  }

  return {
    ok: true,
    weights: {
      usEquity: fraction(sleeveBps.usEquity),
      internationalEquity: fraction(sleeveBps.internationalEquity),
      nominalBonds: fraction(sleeveBps.nominalBonds),
      tips: fraction(sleeveBps.tips),
      cash: fraction(sleeveBps.cash),
    },
    derivation,
  };
}

export type RegistryUpdateProposal =
  | { applicable: true; entry: RegistryEntry; derivation: string[] }
  | { applicable: false; reason: string };

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * The row an Update would add for `current`, given what its source publishes
 * now, or why there is none.
 *
 * The new row is appended, never written over `current`. It carries the new
 * holdings date and becomes available on the day it was observed, so an
 * analysis of an earlier snapshot still gets the weights published then.
 */
export function proposeRegistryUpdate(
  current: RegistryEntry,
  observed: SourceFingerprint,
): RegistryUpdateProposal {
  if (observed.value === current.sourceFingerprint.value) {
    return { applicable: false, reason: 'the source still publishes what this entry records' };
  }
  if (observed.kind !== 'published-values') {
    return {
      applicable: false,
      reason: 'the holdings are inside a PDF this codebase cannot read, so the weights have to be transcribed by hand',
    };
  }
  if (current.identity.provider !== 'state-street') {
    return { applicable: false, reason: `no derivation rules exist for ${current.identity.provider}` };
  }
  if (observed.kind !== current.sourceFingerprint.kind) {
    return { applicable: false, reason: `the entry records a ${current.sourceFingerprint.kind} fingerprint` };
  }
  if (sha256(observed.observed) !== observed.value) {
    return { applicable: false, reason: 'the observation is self-inconsistent: value !== sha256(observed)' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observed.sourceAsOf) || !observed.observed.startsWith(`${observed.sourceAsOf}|`)) {
    return { applicable: false, reason: 'the source does not state a holdings date' };
  }
  if (observed.sourceAsOf < current.allocationAsOf) {
    return {
      applicable: false,
      reason: `the source advertises ${observed.sourceAsOf}, older than the ${current.allocationAsOf} this entry records`,
    };
  }
  if (observed.observedAt < observed.sourceAsOf) {
    return { applicable: false, reason: 'the observation predates the holdings date it reports' };
  }

  const derived = deriveStateStreetWeights(observed.observed);
  if (!derived.ok) return { applicable: false, reason: derived.reason };

  return {
    applicable: true,
    derivation: derived.derivation,
    entry: {
      identity: { ...current.identity },
      allocationAsOf: observed.sourceAsOf,
      availableFrom: observed.observedAt,
      sourceUrl: current.sourceUrl,
      sourceContext: current.sourceContext,
      exactAllocation: current.exactAllocation,
      tipsAllocationStatus: current.tipsAllocationStatus,
      sourceFingerprint: { ...observed },
      weights: derived.weights,
    },
  };
}
