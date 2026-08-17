/**
 * The extractor proposes inputs to a financial projection, so what it is not
 * allowed to do matters more than what it reads. These cover the deterministic
 * bounds every context-planner proposal has to clear.
 */

import { validateExtractedInputs } from '../../openai/retirement-input-extraction';

describe('validateExtractedInputs', () => {
  const noSources = { currentAge: null, retirementAge: null, annualWithdrawalAmount: null, withdrawalStartAge: null, lifeExpectancy: null };

  it('keeps values a real plan can occupy, with the words they came from', () => {
    const result = validateExtractedInputs({
      currentAge: 48,
      retirementAge: 58,
      annualWithdrawalAmount: 125_000,
      withdrawalStartAge: 58,
      lifeExpectancy: 95,
      sources: { ...noSources, annualWithdrawalAmount: '$125K as my target annual spending' },
    });

    expect(result).toMatchObject({
      currentAge: 48,
      retirementAge: 58,
      annualWithdrawalAmount: 125_000,
      withdrawalStartAge: 58,
      lifeExpectancy: 95,
    });
    expect(result.sources.annualWithdrawalAmount).toBe('$125K as my target annual spending');
  });

  it('drops an impossible value rather than clamping it', () => {
    // Clamping would run a projection on a number nobody chose. Dropping it
    // reports the input as missing, which asks the user.
    const result = validateExtractedInputs({
      ...noSources,
      currentAge: 8,
      retirementAge: 250,
      annualWithdrawalAmount: -5,
    });

    expect(result.currentAge).toBeUndefined();
    expect(result.retirementAge).toBeUndefined();
    expect(result.annualWithdrawalAmount).toBeUndefined();
  });

  it('accepts a frugal annual spend that the pattern rules would have refused', () => {
    // The old bare-number floor rejected anything under $10,000 because it
    // could not tell a year from a month. With the turns in front of it the
    // model can, so the bound only rejects impossible magnitudes.
    const result = validateExtractedInputs({ ...noSources, annualWithdrawalAmount: 8_000 });
    expect(result.annualWithdrawalAmount).toBe(8_000);
  });

  it('rejects a fractional age but not a fractional amount', () => {
    const result = validateExtractedInputs({ ...noSources, currentAge: 48.5, annualWithdrawalAmount: 125_000.5 });
    expect(result.currentAge).toBeUndefined();
    expect(result.annualWithdrawalAmount).toBe(125_000.5);
  });

  it('derives the withdrawal start from the retirement age when unstated', () => {
    const result = validateExtractedInputs({ ...noSources, retirementAge: 62 });
    expect(result.withdrawalStartAge).toBe(62);
  });

  it('survives a malformed payload without inventing values', () => {
    for (const payload of [null, undefined, 'nope', {}, { annualWithdrawalAmount: 'a lot' }]) {
      const result = validateExtractedInputs(payload);
      expect(result.annualWithdrawalAmount).toBeUndefined();
      expect(result.sources).toEqual({});
    }
  });
});
