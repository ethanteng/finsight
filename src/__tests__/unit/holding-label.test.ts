import { describe, expect, it } from '@jest/globals';
import { describeHoldingForProse, isProviderIdentifierLabel } from '../../services/holding-label';

/**
 * The mapper's label chain ends at the provider's security id, and that label
 * travels two ways: into `proxyUsage`, which the admin report resolves back to
 * a name, and into `missingData`, which reaches the model's context pack and
 * from there an explanation a person reads.
 *
 * These fix the boundary between the two shapes. A false negative is cheap -- an
 * id reads as it does today. A false positive would replace a real fund name
 * with "Unidentified holding", so the cases below lean on names that must pass
 * through untouched.
 */
describe('holding label shape', () => {
  describe('identifies provider identifiers', () => {
    it.each([
      // Observed in production: Plaid ids and an institutional form.
      '7dD8KV8owvUX4bDwnDNPcLPy8Kyr9dFzwg9RN',
      'SPUSA061004C00000000',
      'M654JE4yQdCRMKroO17KuZJ3Lo34kKHkV08Je',
      'VK0EQ5Ea13uwRLYMbQ9bHNz0Jd0ZYMHa69aPw',
      'US0378331005', // ISIN -- also an identifier, correctly flagged
    ])('%s', label => {
      expect(isProviderIdentifierLabel(label)).toBe(true);
    });
  });

  describe('leaves anything a person reads alone', () => {
    it.each([
      // Every one of these is a real label from the same feeds.
      'State St Target Ret 2025 SL SF CL III',
      'EQ/Com Stck Index',
      'Vanguard Total Stock Market Index Fund',
      'SPDR Gold Shares',
      'VTI',            // ticker: terse, but read as a name
      'VFIAX',
      'Unknown Security', // ingestion's own fallback -- poor, but not hex
      'Cash',
      '',
    ])('%s', label => {
      expect(isProviderIdentifierLabel(label)).toBe(false);
    });

    it('does not flag a run-together name that carries no number', () => {
      // The digit requirement exists for exactly this: length and the absence
      // of spaces alone would condemn a name like this one.
      expect(isProviderIdentifierLabel('VanguardTotalStockMarket')).toBe(false);
    });

    it('does not flag a fund name that is long but spaced', () => {
      expect(isProviderIdentifierLabel('State Street Target Retirement 2040 Non-Lending Series K')).toBe(false);
    });
  });

  describe('describing a holding for prose', () => {
    it('says what an identifier is instead of presenting it as a name', () => {
      expect(describeHoldingForProse('SPUSA061004C00000000'))
        .toBe('Unidentified holding (SPUSA061004C00000000)');
    });

    it('keeps the identifier, because it is the only handle on the security', () => {
      // Dropping it would make the gap unactionable: there would be nothing to
      // give the provider when asking what the holding is.
      expect(describeHoldingForProse('7dD8KV8owvUX4bDwnDNPcLPy8Kyr9dFzwg9RN'))
        .toContain('7dD8KV8owvUX4bDwnDNPcLPy8Kyr9dFzwg9RN');
    });

    it('passes a real name through unchanged', () => {
      expect(describeHoldingForProse('State St Target Ret 2040 SL SF CL III'))
        .toBe('State St Target Ret 2040 SL SF CL III');
    });
  });
});
