/**
 * Your numbers: the plan a user saved, read back only as far as it still
 * holds together, and changed only all at once.
 */
import { describe, expect, it } from '@jest/globals';
import { applyStatedFigureUpdate, parseStatedFigures } from '../../services/stated-figures';

const NOW = new Date('2026-10-09T12:00:00.000Z');

describe('reading saved figures', () => {
  it('keeps every figure that still holds together and drops the rest', () => {
    expect(parseStatedFigures({
      retirementAge: { value: 60, savedAt: '2026-10-01T00:00:00.000Z', source: 'answer' },
      allocation: { value: 'growth', savedAt: '2026-10-01T00:00:00.000Z', source: 'page' },
      // Out of bounds, unknown, malformed: each dropped on its own.
      annualRetirementSpending: { value: 50, savedAt: '2026-10-01T00:00:00.000Z', source: 'page' },
      favouriteColour: { value: 'green', savedAt: '2026-10-01T00:00:00.000Z', source: 'page' },
      planThroughAge: { value: 95, savedAt: 'yesterday', source: 'page' },
      socialSecurityStartAge: { value: 67.5, savedAt: '2026-10-01T00:00:00.000Z', source: 'page' },
    })).toEqual({
      retirementAge: { value: 60, savedAt: '2026-10-01T00:00:00.000Z', source: 'answer' },
      allocation: { value: 'growth', savedAt: '2026-10-01T00:00:00.000Z', source: 'page' },
    });
    expect(parseStatedFigures(null)).toEqual({});
    expect(parseStatedFigures([])).toEqual({});
  });
});

describe('changing saved figures', () => {
  const current = parseStatedFigures({
    retirementAge: { value: 60, savedAt: '2026-10-01T00:00:00.000Z', source: 'answer' },
    annualRetirementSpending: { value: 80_000, savedAt: '2026-10-01T00:00:00.000Z', source: 'answer' },
  });

  it('sets, clears, and keeps the date on a figure that did not change', () => {
    const { figures, rejected } = applyStatedFigureUpdate(current, {
      retirementAge: 60,
      annualRetirementSpending: null,
      annualContribution: 20_000,
    }, 'page', NOW);

    expect(rejected).toEqual({});
    expect(figures).toEqual({
      retirementAge: { value: 60, savedAt: '2026-10-01T00:00:00.000Z', source: 'answer' },
      annualContribution: { value: 20_000, savedAt: NOW.toISOString(), source: 'page' },
    });
  });

  it('changes nothing when any figure named cannot be accepted', () => {
    const { figures, rejected } = applyStatedFigureUpdate(current, {
      annualContribution: 20_000,
      retirementAge: 120,
      allocation: 'aggressive',
      netWorth: 1_000_000,
    }, 'page', NOW);

    expect(figures).toBe(current);
    expect(rejected).toEqual({
      retirementAge: 'Age you plan to retire must be a whole number from 30 to 95.',
      allocation: 'Preset mix must be one of conservative, balanced, growth.',
      netWorth: 'Not a figure Your numbers keeps.',
    });
  });
});
