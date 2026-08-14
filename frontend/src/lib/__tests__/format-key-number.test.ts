import { formatKeyNumberValue } from '../formatKeyNumber';

describe('formatKeyNumberValue', () => {
  it('uses explicit units from the response schema', () => {
    expect(formatKeyNumberValue('savings_rate', { value: 12.5, unit: 'percent', provenance: 'savings_rate' })).toBe('12.5%');
    expect(formatKeyNumberValue('months_of_runway', { value: 18, unit: 'months', provenance: 'months_of_runway' })).toBe('18');
  });

  it('does not infer age from mortgage or rewrite percentages by magnitude', () => {
    expect(formatKeyNumberValue('mortgage_payoff_fund_balance', 4352.34)).toBe('$4,352');
    expect(formatKeyNumberValue('withdrawal_rate', 150)).toBe('150%');
    expect(formatKeyNumberValue('retirement_age', 65)).toBe('65');
  });
});
