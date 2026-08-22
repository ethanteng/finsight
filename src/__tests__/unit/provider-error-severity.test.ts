import { describe, expect, it } from '@jest/globals';
import { isPartialData, type ErrorDetail } from '../../services/financial-data-service';

const at = new Date('2026-08-20T11:00:00.000Z');
const advisory = (error: string): ErrorDetail => ({ error, timestamp: at, severity: 'advisory' });
const dataMissing = (error: string): ErrorDetail => ({ error, timestamp: at, severity: 'data-missing' });
const untagged = (error: string): ErrorDetail => ({ error, timestamp: at });
const noErrors = { plaid: [] as ErrorDetail[], snaptrade: [] as ErrorDetail[], homeValue: null };

describe('isPartialData', () => {
  it('is false when nothing failed', () => {
    expect(isPartialData(noErrors)).toBe(false);
  });

  // The case that froze real users: SnapTrade returned every holding and
  // activity, and only the brokerage authorization lookup was unverified. The
  // picture was complete, so the fetch was not partial.
  it('is false when the only errors are advisories', () => {
    expect(isPartialData({
      ...noErrors,
      snaptrade: [
        advisory('SnapTrade connection health could not be verified'),
        advisory('SnapTrade connection is disabled; showing the last cached brokerage state.'),
      ],
    })).toBe(false);
  });

  it('is true when a provider actually lost data', () => {
    expect(isPartialData({ ...noErrors, plaid: [dataMissing('Plaid unavailable')] })).toBe(true);
    expect(isPartialData({ ...noErrors, snaptrade: [dataMissing('holdings incomplete')] })).toBe(true);
    expect(isPartialData({ ...noErrors, public: [dataMissing('Public portfolio unavailable')] })).toBe(true);
  });

  it('treats an untagged error as data-missing', () => {
    expect(isPartialData({ ...noErrors, plaid: [untagged('Plaid unavailable')] })).toBe(true);
  });

  it('is true when an advisory accompanies a real failure', () => {
    expect(isPartialData({
      ...noErrors,
      snaptrade: [advisory('health unverified'), dataMissing('holdings incomplete')],
    })).toBe(true);
  });

  // A rejected home-value fetch has no severity to carry, and it is genuinely
  // a missing source, so it keeps making the fetch partial.
  it('is true when the home value fetch rejected', () => {
    expect(isPartialData({ ...noErrors, homeValue: { error: 'RentCast timeout' } })).toBe(true);
  });
});
