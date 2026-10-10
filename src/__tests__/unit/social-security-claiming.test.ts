import { describe, expect, it } from '@jest/globals';
import {
  benefitAtClaimingAge,
  claimingFactor,
  describeClaimingAdjustment,
  fullRetirementAgeMonths,
} from '../../services/social-security-claiming';

describe('Social Security claiming-age rules', () => {
  it('uses SSA\'s full retirement age table', () => {
    expect(fullRetirementAgeMonths(1954)).toBe(66 * 12);
    expect(fullRetirementAgeMonths(1957)).toBe(66 * 12 + 6);
    expect(fullRetirementAgeMonths(1959)).toBe(66 * 12 + 10);
    expect(fullRetirementAgeMonths(1960)).toBe(67 * 12);
    expect(fullRetirementAgeMonths(1990)).toBe(67 * 12);
  });

  it('pays 70% at 62 and 124% at 70 when full retirement age is 67', () => {
    const fra = 67 * 12;
    expect(claimingFactor(62 * 12, fra)).toBeCloseTo(0.7, 10);
    expect(claimingFactor(64 * 12, fra)).toBeCloseTo(0.8, 10);
    expect(claimingFactor(67 * 12, fra)).toBeCloseTo(1, 10);
    expect(claimingFactor(70 * 12, fra)).toBeCloseTo(1.24, 10);
    // Nothing earlier than 62 or later than 70 changes anything.
    expect(claimingFactor(60 * 12, fra)).toBeCloseTo(0.7, 10);
    expect(claimingFactor(75 * 12, fra)).toBeCloseTo(1.24, 10);
  });

  it('pays 75% at 62 and 132% at 70 when full retirement age is 66', () => {
    const fra = 66 * 12;
    expect(claimingFactor(62 * 12, fra)).toBeCloseTo(0.75, 10);
    expect(claimingFactor(70 * 12, fra)).toBeCloseTo(1.32, 10);
  });

  it('rescales a benefit from the age it is for to the age it is claimed', () => {
    const later = benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 67, claimAge: 70, currentAge: 45, asOfYear: 2026 });
    expect(later).toEqual({
      fromAmount: 30_000,
      fromAge: 67,
      toAge: 70,
      amount: 37_200,
      fullRetirementAge: { years: 67, months: 0 },
    });
    expect(benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 67, claimAge: 62, currentAge: 45, asOfYear: 2026 })?.amount)
      .toBe(21_000);
    // From 62 to 70 goes through the full-retirement-age benefit.
    expect(benefitAtClaimingAge({ amount: 21_000, quotedAtAge: 62, claimAge: 70, currentAge: 45, asOfYear: 2026 })?.amount)
      .toBe(37_200);
  });

  it('changes nothing it should not', () => {
    // Same age, both past 70, or a claim age already in the past.
    expect(benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 67, claimAge: 67, currentAge: 45, asOfYear: 2026 })).toBeNull();
    expect(benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 70, claimAge: 72, currentAge: 45, asOfYear: 2026 })).toBeNull();
    expect(benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 70, claimAge: 64, currentAge: 66, asOfYear: 2026 })).toBeNull();
    expect(benefitAtClaimingAge({ amount: 0, quotedAtAge: 67, claimAge: 70, currentAge: 45, asOfYear: 2026 })).toBeNull();
    // Before 62 is not a retirement benefit these rules describe.
    expect(benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 67, claimAge: 60, currentAge: 45, asOfYear: 2026 })).toBeNull();
    expect(benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 55, claimAge: 67, currentAge: 45, asOfYear: 2026 })).toBeNull();
  });

  it('still moves a statement age that has already passed when the claim is ahead', () => {
    // A 68-year-old whose statement quotes $30,000 at 67 has not necessarily
    // claimed; claiming at 70 still earns delayed credits from that figure.
    const later = benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 67, claimAge: 70, currentAge: 68, asOfYear: 2026 });
    expect(later).toMatchObject({ fromAmount: 30_000, fromAge: 67, toAge: 70 });
    expect(later?.amount).toBe(Math.round(30_000 * (1 + (40 * 2) / 300) / (1 + (4 * 2) / 300)));
  });

  it('takes the full retirement age from the birth year the current age implies', () => {
    // 68 in 2026: born 1958, full retirement age 66 and 8 months.
    const adjustment = benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 69, claimAge: 70, currentAge: 68, asOfYear: 2026 })!;
    expect(adjustment.fullRetirementAge).toEqual({ years: 66, months: 8 });
    expect(adjustment.amount).toBe(Math.round(30_000 * (1 + (40 * 2) / 300) / (1 + (28 * 2) / 300)));
  });

  it('names both amounts, the direction and the full retirement age', () => {
    const adjustment = benefitAtClaimingAge({ amount: 30_000, quotedAtAge: 67, claimAge: 70, currentAge: 45, asOfYear: 2026 })!;
    expect(describeClaimingAdjustment(adjustment)).toBe(
      'Claimed at 70 instead of 67, Social Security of $30,000 a year becomes $37,200 by Social Security\'s own rules ' +
      '(a credit for each month after full retirement age, which I took as 67 from your age).'
    );
  });
});
