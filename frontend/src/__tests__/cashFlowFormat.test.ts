import { roundToTotal } from '@/lib/cash-flow-format';

describe('roundToTotal', () => {
  it('gives the units the total needs to the values that lost the most', () => {
    // Rounded down they make 3114; 9.8 lost the most, so it takes the spare unit.
    expect(roundToTotal([2000, 1090.2, 15.49, 9.8], 3115)).toEqual([2000, 1090, 15, 10]);
    expect(roundToTotal([33.33, 33.33, 33.34], 100)).toEqual([33, 33, 34]);
  });

  it('takes units back from the values that lost the least when they add up to more', () => {
    // Rounded down they already make 4, one more than the total.
    expect(roundToTotal([2.2, 2.6], 3)).toEqual([1, 2]);
    // On a tie, the earlier value keeps its unit.
    expect(roundToTotal([1.1, 1.1, 1.1], 1)).toEqual([1, 0, 0]);
    // A part that floored to 0 does not go negative to fund the take-back.
    expect(roundToTotal([50.02, 0.01, 0.01], 49)).toEqual([49, 0, 0]);
  });

  it('leaves whole values that already add up alone', () => {
    expect(roundToTotal([5, 3, 2], 10)).toEqual([5, 3, 2]);
    expect(roundToTotal([], 0)).toEqual([]);
  });
});
