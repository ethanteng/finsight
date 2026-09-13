import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { listRegistryEntries } from '../../services/target-date-fund-registry';
import { observerFingerprintKinds } from '../../services/registry-source-check';

/**
 * The registry's allocations are hand-transcribed from provider pages that are
 * mutable and republished on the provider's own cadence. A `sourceUrl` alone
 * does not reproduce the figure it supports, so each entry has to carry a
 * fingerprint of what its source said when it was observed.
 *
 * These are invariants on the evidence, not on the numbers. They exist so a new
 * entry cannot be added with a citation nobody can check later.
 */
describe('target-date registry provenance', () => {
  const entries = listRegistryEntries();

  it('has entries to check', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('can observe every provider it stores', () => {
    // A provider added without an observer does not fail loudly: its entry
    // reports `error` on every run, which pins `verify-registry-sources` at a
    // non-zero exit and leaves that source unwatched for drift. Nothing caught
    // that when the UC entry was first written, so this does.
    const observable = new Set(Object.keys(observerFingerprintKinds()));
    const unobservable = [...new Set(entries.map(entry => entry.identity.provider))]
      .filter(provider => !observable.has(provider));

    expect(unobservable).toEqual([]);
  });

  it('records a source fingerprint for every entry', () => {
    const missing = entries
      .filter(entry => !entry.sourceFingerprint)
      .map(entry => `${entry.identity.provider}/${entry.identity.vintage}`);
    expect(missing).toEqual([]);
  });

  it('stores the fingerprint kind its own observer emits', () => {
    // Hashing a fund page's markup reports drift on every unrelated build, so
    // a rendered page fingerprints the figures read off it; a document is
    // hashed whole. Which applies is decided by the provider's observer, not
    // by the URL's spelling -- UC serves a PDF from a link with no extension,
    // and the suffix heuristic this replaces called that an HTML page.
    //
    // Matching the observer is the load-bearing part: a stored kind the
    // observer will never emit compares two incomparable things and reports
    // drift forever.
    const kinds = observerFingerprintKinds();
    const mismatched = entries
      .filter(entry => entry.sourceFingerprint?.kind !== kinds[entry.identity.provider])
      .map(entry => `${entry.identity.provider}/${entry.identity.vintage}`);

    expect(mismatched).toEqual([]);
  });

  it('stores a sha256-shaped value and an ISO observation date', () => {
    for (const entry of entries) {
      expect(entry.sourceFingerprint?.value).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.sourceFingerprint?.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('binds published-values hashes to the human-readable observed string', () => {
    // Auditors read `observed`; the verifier compares `value`. If those diverge,
    // humans and the machine are checking different evidence.
    for (const entry of entries) {
      const fingerprint = entry.sourceFingerprint;
      if (fingerprint.kind !== 'published-values') continue;
      expect(fingerprint.sourceAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fingerprint.observed.startsWith(`${fingerprint.sourceAsOf}|`)).toBe(true);
      expect(createHash('sha256').update(fingerprint.observed).digest('hex')).toBe(fingerprint.value);
    }
  });

  it('never claims an observation predating the allocation it attests to', () => {
    // A fingerprint taken before the holdings date would describe a different
    // publication than the one the weights came from.
    for (const entry of entries) {
      const observedAt = entry.sourceFingerprint?.observedAt;
      if (!observedAt) continue;
      expect(observedAt >= entry.allocationAsOf).toBe(true);
    }
  });

  it('keeps the published-values fingerprint legible to a human auditor', () => {
    // `observed` is what someone without the tooling compares against the page.
    for (const entry of entries) {
      if (entry.sourceFingerprint?.kind !== 'published-values') continue;
      expect(entry.sourceFingerprint.observed).toMatch(/^\d{4}-\d{2}-\d{2}\|/);
      expect(entry.sourceFingerprint.observed).toMatch(/=\d{1,2}\.\d{2}(\||$)/);
    }
  });

  it('attests to the same publication the weights were taken from', () => {
    // The earlier version of this fingerprint covered a fund page's aggregate
    // "Asset Allocation" table, which is republished monthly and is NOT what the
    // weights derive from. A fingerprint whose sourceAsOf differs from
    // allocationAsOf proves nothing about the stored numbers: it would baseline
    // a later publication and report `unchanged` while the transcribed values
    // went unverified. Where the source states its own date, the two must agree.
    for (const entry of entries) {
      const sourceAsOf = entry.sourceFingerprint?.sourceAsOf;
      if (!sourceAsOf || sourceAsOf === 'see-document') continue;
      expect(sourceAsOf).toBe(entry.allocationAsOf);
    }
  });

  it('covers the component holdings, not an aggregate that can hide a shift', () => {
    // Equity/Fixed Income totals are unchanged when a provider moves weight
    // between US and international, so an aggregate fingerprint would report
    // `unchanged` while the simulation's inputs had drifted.
    for (const entry of entries) {
      const observed = entry.sourceFingerprint?.observed;
      if (entry.sourceFingerprint?.kind !== 'published-values' || !observed) continue;
      expect(observed).not.toMatch(/\|equity=\d/);
      expect(observed.split('|').length).toBeGreaterThan(3);
    }
  });

  it('keeps long holding names intact for human auditors', () => {
    // A 71-character name cap previously truncated
    // "State Street SPDR Bloomberg Enhanced Roll Yield…" to "Street SPDR…",
    // which does not appear on the page. Auditors compare `observed` to the
    // live table, so truncated names defeat the provenance check.
    for (const entry of entries) {
      const observed = entry.sourceFingerprint?.observed;
      if (entry.sourceFingerprint?.kind !== 'published-values' || !observed) continue;
      expect(observed).not.toMatch(/(^|\|)street spdr /);
    }
  });

  it('returns copies, so an auditing caller cannot mutate the live table', () => {
    const first = listRegistryEntries()[0];
    first.weights.usEquity = -999;
    first.identity.vintage = 1900;
    first.sourceFingerprint.value = 'tampered';
    const reread = listRegistryEntries()[0];
    expect(reread.weights.usEquity).not.toBe(-999);
    expect(reread.identity.vintage).not.toBe(1900);
    expect(reread.sourceFingerprint.value).not.toBe('tampered');
  });
});
