import { mergeCanonicalCurrentWithHistory } from '../canonical-financial-history';

describe('mergeCanonicalCurrentWithHistory', () => {
  it('deduplicates the current persisted row without rewriting prior values', () => {
    const current = {
      computedAt: '2026-08-14T12:00:00.000Z',
      netWorth: 120,
      totalCash: 20,
      totalInvestments: 100,
      totalDebt: 0,
      homeValue: null,
    };
    const historical = [
      { ...current },
      {
        computedAt: '2026-07-01T12:00:00.000Z',
        netWorth: 40,
        totalCash: 10,
        totalInvestments: 20,
        totalDebt: 5,
        homeValue: 15,
      },
      {
        computedAt: '2026-06-01T12:00:00.000Z',
        netWorth: 25,
        totalCash: 10,
        totalInvestments: 20,
        totalDebt: 5,
        homeValue: null,
      },
    ];

    const result = mergeCanonicalCurrentWithHistory(current, historical);

    expect(result).toEqual([current, historical[1], historical[2]]);
    expect(result[1].homeValue).toBe(15);
    expect(result[2].homeValue).toBeNull();
    expect(result[1].netWorth).toBe(40);
    expect(result[2].netWorth).toBe(25);
  });
});
