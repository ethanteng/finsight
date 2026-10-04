import { describe, expect, it } from '@jest/globals';
import { presetStandInReason } from '../../scenarios/preset-stand-in';

describe('preset stand-in', () => {
  it('stands in when nothing is linked', () => {
    expect(presetStandInReason({} as any)).toBe('no_holdings');
    expect(presetStandInReason({ investments: { holdings: [] } } as any)).toBe('no_holdings');
  });

  it('stands in when linked holdings cannot be simulated', () => {
    expect(presetStandInReason({
      investments: { holdings: [{ id: 'btc' }] },
      retirementAnalysisNeedsInfo: { missingParams: [], detectedParams: {}, unavailableCode: 'no_supported_simulation' },
    } as any)).toBe('unsupported_holdings');
  });

  it('leaves simulatable holdings to the holdings-based projection, whatever else is missing', () => {
    expect(presetStandInReason({ investments: { holdings: [{ id: 'vti' }] } } as any)).toBeNull();
    expect(presetStandInReason({
      investments: { holdings: [{ id: 'vti' }] },
      retirementAnalysisNeedsInfo: { missingParams: ['annualWithdrawalAmount'], detectedParams: {} },
    } as any)).toBeNull();
  });
});
