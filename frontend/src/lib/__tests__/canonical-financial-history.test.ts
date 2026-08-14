import {
  historyPointDisplayDate,
  mergeCanonicalCurrentWithHistory,
} from '../canonical-financial-history';

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

  it('uses the current snapshot in place of an older observation from the same day', () => {
    const current = {
      computedAt: '2026-08-14T18:00:00.000Z',
      netWorth: 120,
      totalCash: 20,
      totalInvestments: 100,
      totalDebt: 0,
      homeValue: null,
    };
    const sameDay = {
      ...current,
      computedAt: '2026-08-14T12:00:00.000Z',
      observationDate: '2026-08-14T00:00:00.000Z',
      netWorth: 100,
    };

    expect(mergeCanonicalCurrentWithHistory(current, [sameDay])).toEqual([current]);
  });
});

describe('historyPointDisplayDate', () => {
  it('treats observationDate as a calendar date without UTC shifting', () => {
    const date = historyPointDisplayDate({
      computedAt: '2026-08-15T06:30:00.000Z',
      observationDate: '2026-08-14T00:00:00.000Z',
      netWorth: 1,
      totalCash: 1,
      totalInvestments: 0,
      totalDebt: 0,
      homeValue: null,
    });

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(14);
  });
});
