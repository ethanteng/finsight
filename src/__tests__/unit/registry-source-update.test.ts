import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  listCurrentRegistryEntries,
  listRegistryEntries,
  lookupTargetDateAllocation,
  setAppliedRegistryEntries,
  type RegistryEntry,
  type SourceFingerprint,
} from '../../services/target-date-fund-registry';
import { deriveStateStreetWeights, proposeRegistryUpdate } from '../../services/registry-source-update';
import {
  applyRegistryUpdates,
  publicationToEntry,
  resetAppliedRegistryCache,
} from '../../services/target-date-registry-store';

const rows: Array<Record<string, any>> = [];
const mockPrisma = {
  targetDateRegistryPublication: {
    findMany: jest.fn(async () => [...rows]),
    createMany: jest.fn(async ({ data }: { data: Array<Record<string, any>> }) => {
      let count = 0;
      for (const row of data) {
        const duplicate = rows.some(existing =>
          existing.provider === row.provider && existing.series === row.series &&
          existing.vintage === row.vintage && existing.fingerprintValue === row.fingerprintValue
        );
        if (duplicate) continue;
        rows.push({ id: `row-${rows.length + 1}`, createdAt: new Date(), ...row });
        count += 1;
      }
      return { count };
    }),
  },
};

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => mockPrisma,
}));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function stateStreet(vintage: number): RegistryEntry {
  const entry = listRegistryEntries().find(candidate =>
    candidate.identity.provider === 'state-street' && candidate.identity.vintage === vintage
  );
  if (!entry) throw new Error(`no State Street ${vintage} row`);
  return entry;
}

/** A State Street observation with the given holdings, as the observer records it. */
function observation(sourceAsOf: string, holdings: Record<string, string>, observedAt = '2026-10-05'): SourceFingerprint {
  const observed = `${sourceAsOf}|${Object.entries(holdings).map(([name, weight]) => `${name}=${weight}`).sort().join('|')}`;
  return { kind: 'published-values', value: sha256(observed), observedAt, sourceAsOf, observed };
}

const AUGUST_2040 = {
  'ssi us gov money market class': '0.19',
  'state street aggregate bond index portfolio': '12.10',
  'state street equity 500 index ii portfolio': '35.70',
  'state street global equity ex-u.s. index portfolio': '32.02',
  'state street small/mid cap equity index portfolio': '7.40',
  'state street spdr bloomberg high yield bond etf': '2.90',
  'state street spdr portfolio long term treasury etf': '9.71',
};

describe('deriving State Street weights from a fingerprint', () => {
  it('reproduces every hand-transcribed State Street row from its own fingerprint', () => {
    // The rule is only safe to automate if it is the rule the registry was
    // already transcribed under. Every existing row is the test case.
    const rowsWithValues = listRegistryEntries().filter(entry => entry.sourceFingerprint.kind === 'published-values');
    expect(rowsWithValues.length).toBeGreaterThan(0);
    for (const entry of rowsWithValues) {
      const derived = deriveStateStreetWeights(entry.sourceFingerprint.observed);
      expect(derived).toMatchObject({ ok: true, weights: entry.weights });
    }
  });

  it('never models more than the whole fund', () => {
    for (const entry of listRegistryEntries().filter(row => row.sourceFingerprint.kind === 'published-values')) {
      const derived = deriveStateStreetWeights(entry.sourceFingerprint.observed);
      if (!derived.ok) throw new Error(derived.reason);
      const modeled = Object.values(derived.weights).reduce((total, weight) => total + weight, 0);
      expect(modeled).toBeLessThanOrEqual(1);
    }
  });

  it('refuses a holding it has never placed, and names it', () => {
    // A new or renamed holding needs a person to confirm its sleeve before its
    // weight feeds a projection.
    const derived = deriveStateStreetWeights(observation('2026-08-31', {
      ...AUGUST_2040,
      'state street spdr msci emerging markets etf': '0.00',
    }).observed);
    expect(derived).toEqual({ ok: false, reason: expect.stringContaining('state street spdr msci emerging markets etf') });
  });

  it('refuses a table that is not the whole fund', () => {
    const partial: Record<string, string> = { ...AUGUST_2040 };
    delete partial['state street spdr portfolio long term treasury etf'];
    const derived = deriveStateStreetWeights(observation('2026-08-31', partial).observed);
    expect(derived).toEqual({ ok: false, reason: expect.stringContaining('not the whole fund') });
  });

  it('refuses rounding the cash line cannot absorb', () => {
    const derived = deriveStateStreetWeights(observation('2026-08-31', {
      ...AUGUST_2040,
      'ssi us gov money market class': '0.05',
      'state street equity 500 index ii portfolio': '35.90',
    }).observed);
    expect(derived).toEqual({ ok: false, reason: expect.stringContaining('cash line is too small') });
  });

  it('refuses a holding listed twice', () => {
    const base = observation('2026-08-31', AUGUST_2040).observed;
    const derived = deriveStateStreetWeights(`${base}|state street aggregate bond index portfolio=1.00`);
    expect(derived).toEqual({ ok: false, reason: expect.stringContaining('listed twice') });
  });
});

describe('proposing a registry update', () => {
  it('appends a dated publication rather than rewriting the entry', () => {
    const current = stateStreet(2040);
    const proposal = proposeRegistryUpdate(current, observation('2026-08-31', AUGUST_2040));
    if (!proposal.applicable) throw new Error(proposal.reason);

    expect(proposal.entry).toMatchObject({
      identity: current.identity,
      allocationAsOf: '2026-08-31',
      availableFrom: '2026-10-05',
      sourceUrl: current.sourceUrl,
      exactAllocation: current.exactAllocation,
      tipsAllocationStatus: current.tipsAllocationStatus,
      // 35.70 + 7.40 / 32.02 / 12.10 + 9.71 / 0.19 less 0.02 of rounding (100.02%)
      weights: { usEquity: 0.431, internationalEquity: 0.3202, nominalBonds: 0.2181, tips: 0, cash: 0.0017 },
    });
    expect(proposal.entry.sourceFingerprint.sourceAsOf).toBe(proposal.entry.allocationAsOf);
  });

  it('leaves PDF sources to be transcribed by hand', () => {
    const blackrock = listRegistryEntries().find(entry => entry.identity.provider === 'blackrock')!;
    const proposal = proposeRegistryUpdate(blackrock, {
      kind: 'document-sha256', value: sha256('new bytes'), observedAt: '2026-10-05', sourceAsOf: 'see-document', observed: '9 bytes',
    });
    expect(proposal).toEqual({ applicable: false, reason: expect.stringContaining('transcribed by hand') });
  });

  it('refuses a publication older than the one recorded', () => {
    const proposal = proposeRegistryUpdate(stateStreet(2040), observation('2026-05-31', AUGUST_2040));
    expect(proposal).toEqual({ applicable: false, reason: expect.stringContaining('older than') });
  });

  it('refuses an observation whose hash does not cover what it says it read', () => {
    const tampered = { ...observation('2026-08-31', AUGUST_2040), value: sha256('something else') };
    expect(proposeRegistryUpdate(stateStreet(2040), tampered)).toEqual({
      applicable: false,
      reason: expect.stringContaining('self-inconsistent'),
    });
  });

  it('has nothing to propose when the source has not moved', () => {
    const current = stateStreet(2040);
    expect(proposeRegistryUpdate(current, current.sourceFingerprint)).toMatchObject({ applicable: false });
  });
});

describe('applied publications in the registry', () => {
  afterEach(() => setAppliedRegistryEntries([]));

  it('serves the new weights only from the day they were observed', () => {
    const current = stateStreet(2040);
    const proposal = proposeRegistryUpdate(current, observation('2026-08-31', AUGUST_2040));
    if (!proposal.applicable) throw new Error(proposal.reason);
    setAppliedRegistryEntries([proposal.entry]);

    // An earlier snapshot keeps the publication that existed then.
    expect(lookupTargetDateAllocation(current.identity, '2026-10-04')).toMatchObject({
      allocationAsOf: '2026-06-30',
      weights: current.weights,
    });
    expect(lookupTargetDateAllocation(current.identity, '2026-10-05')).toMatchObject({
      allocationAsOf: '2026-08-31',
      weights: proposal.entry.weights,
    });
  });

  it('checks only the newest publication of each fund, in registry order', () => {
    const proposal = proposeRegistryUpdate(stateStreet(2040), observation('2026-08-31', AUGUST_2040));
    if (!proposal.applicable) throw new Error(proposal.reason);
    const before = listCurrentRegistryEntries().map(entry => entry.identity.vintage);
    setAppliedRegistryEntries([proposal.entry]);

    const current = listCurrentRegistryEntries();
    expect(current.map(entry => entry.identity.vintage)).toEqual(before);
    expect(current.find(entry => entry.identity.provider === 'state-street' && entry.identity.vintage === 2040))
      .toMatchObject({ allocationAsOf: '2026-08-31' });
    // The superseded row stays in the history audits read.
    expect(listRegistryEntries().filter(entry =>
      entry.identity.provider === 'state-street' && entry.identity.vintage === 2040
    )).toHaveLength(2);
  });
});

describe('stored publications', () => {
  const validRow = () => {
    const proposal = proposeRegistryUpdate(stateStreet(2040), observation('2026-08-31', AUGUST_2040));
    if (!proposal.applicable) throw new Error(proposal.reason);
    const entry = proposal.entry;
    return {
      id: 'row',
      provider: entry.identity.provider,
      series: entry.identity.series,
      vintage: entry.identity.vintage,
      allocationAsOf: entry.allocationAsOf,
      availableFrom: entry.availableFrom,
      sourceUrl: entry.sourceUrl,
      sourceContext: entry.sourceContext,
      exactAllocation: entry.exactAllocation,
      tipsAllocationStatus: entry.tipsAllocationStatus,
      weights: { ...entry.weights } as unknown,
      sourceFingerprint: { ...entry.sourceFingerprint } as unknown,
      fingerprintValue: entry.sourceFingerprint.value,
    };
  };

  it('loads a row the update wrote', () => {
    expect(typeof publicationToEntry(validRow())).toBe('object');
  });

  it('rejects a row whose weights were edited to create value', () => {
    const row = validRow();
    row.weights = { ...(row.weights as object), usEquity: 0.9 };
    expect(publicationToEntry(row)).toBe('weights total more than 1');
  });

  it('rejects a row whose sleeve weights were redistributed without changing the fingerprint', () => {
    const row = validRow();
    const weights = row.weights as { usEquity: number; cash: number };
    // Keep the total ≤ 1 so the sum check alone would not catch this.
    row.weights = { ...(row.weights as object), usEquity: weights.usEquity - 0.01, cash: weights.cash + 0.01 };
    expect(publicationToEntry(row)).toMatch(/weights do not match/);
  });

  it('rejects a kind of row the update never writes', () => {
    // No derivation exists for it, so nothing could check its weights.
    const row = { ...validRow(), provider: 'blackrock', series: 'lifepath-index' };
    expect(publicationToEntry(row)).toMatch(/unknown identity/);
  });

  it('rejects a row that backdates when the new weights become available', () => {
    const row = validRow();
    row.availableFrom = '2026-01-01';
    expect(publicationToEntry(row)).toMatch(/availableFrom/);
  });

  it('rejects a row whose weights no longer come from the publication it cites', () => {
    const row = validRow();
    row.allocationAsOf = '2026-07-31';
    expect(publicationToEntry(row)).toMatch(/different publication/);
  });

  it('rejects a row that would aim the source check at anything but a public page', () => {
    const row = validRow();
    row.sourceUrl = 'http://169.254.169.254/latest/meta-data/';
    expect(publicationToEntry(row)).toMatch(/https/);
  });

  it('rejects a row whose fingerprint was edited', () => {
    const row = validRow();
    row.sourceFingerprint = { ...(row.sourceFingerprint as object), observed: 'edited' };
    expect(publicationToEntry(row)).toMatch(/sha256/);
  });
});

describe('applying approved updates', () => {
  const originalFetch = global.fetch;

  /** A State Street fund page carrying the August 2040 holdings table. */
  function fundPage(holdings: Record<string, string>): string {
    const lines = Object.entries(holdings)
      .map(([name, weight]) => `<tr><td>${name.replace(/(^|\s)\S/g, letter => letter.toUpperCase())}</td><td>${weight}%</td></tr>`)
      .join('');
    return `<html><body><h2>Fund Top Holdings as of Aug 31 2026</h2><table><tr><th>Name</th><th>Weight</th></tr>${lines}</table>` +
      '<a>Download All Holdings</a></body></html>';
  }

  beforeEach(() => {
    rows.length = 0;
    resetAppliedRegistryCache();
    const url2040 = stateStreet(2040).sourceUrl;
    global.fetch = jest.fn(async (url: string | URL | Request) =>
      String(url) === url2040
        ? new Response(fundPage(AUGUST_2040), { status: 200 })
        : new Response('not found', { status: 404 })
    ) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetAppliedRegistryCache();
  });

  it('records the publication the operator approved, once', async () => {
    // The page's names are title-cased; the observer lowercases them, so the
    // observation the operator saw is the lowercase table above.
    const approved = observation('2026-08-31', AUGUST_2040);
    const [outcome] = await applyRegistryUpdates(
      [{ key: 'state-street/target-retirement/2040', observedValue: approved.value }],
      'admin@example.com',
    );

    expect(outcome).toMatchObject({ outcome: 'applied' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ appliedBy: 'admin@example.com', allocationAsOf: '2026-08-31' });
    expect(listCurrentRegistryEntries().find(entry => entry.identity.vintage === 2040 && entry.identity.provider === 'state-street'))
      .toMatchObject({ allocationAsOf: '2026-08-31' });

    // Approving it again finds the entry already matching its source.
    const [again] = await applyRegistryUpdates(
      [{ key: 'state-street/target-retirement/2040', observedValue: approved.value }],
      'admin@example.com',
    );
    expect(again.outcome).toBe('not-drifted');
    expect(rows).toHaveLength(1);
  });

  it('applies nothing when the source has published again since it was checked', async () => {
    const seenEarlier = observation('2026-07-31', AUGUST_2040);
    const [outcome] = await applyRegistryUpdates(
      [{ key: 'state-street/target-retirement/2040', observedValue: seenEarlier.value }],
      'admin@example.com',
    );
    expect(outcome.outcome).toBe('changed');
    expect(rows).toHaveLength(0);
  });

  it('applies nothing for an unreadable source', async () => {
    const [outcome] = await applyRegistryUpdates(
      [{ key: 'state-street/target-retirement/2030', observedValue: sha256('anything') }],
      'admin@example.com',
    );
    expect(outcome.outcome).toBe('not-drifted');
    expect(rows).toHaveLength(0);
  });
});
