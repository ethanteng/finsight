import { describe, expect, it } from '@jest/globals';
import {
  resolveSpendingFlexibility,
  savableSpendingCut,
  spendingFlexibilityInput,
} from '../../services/spending-flexibility';
import { statedSpendingCutOf, validateExtractedInputs } from '../../openai/retirement-input-extraction';
import { buildSaveOffer } from '../../openai/save-offer';
import { describeSpendingFlexibilityResults } from '../../openai/spending-flexibility-evidence';
import { acceptedFigureValue } from '../../services/stated-figures';

const SAVED_AT = '2026-09-14T10:00:00.000Z';
const saved = (value: number) => ({ spendingCutPercent: { value, savedAt: SAVED_AT, source: 'page' as const } });

describe('how much a user could cut in a bad market', () => {
  it('reads a share, an amount or a floor against the plan\'s spending', () => {
    expect(resolveSpendingFlexibility({ stated: { percent: 20 }, annualSpending: 60_000 })).toEqual({
      kind: 'cut', cutShare: 0.2, annualCut: 12_000, origin: 'stated', statedAs: 'percent',
    });
    expect(resolveSpendingFlexibility({ stated: { annualAmount: 15_000 }, annualSpending: 60_000 })).toMatchObject({
      kind: 'cut', cutShare: 0.25, annualCut: 15_000, statedAs: 'amount',
    });
    expect(resolveSpendingFlexibility({ stated: { essentialAnnual: 48_000 }, annualSpending: 60_000 })).toMatchObject({
      kind: 'cut', cutShare: 0.2, annualCut: 12_000, statedAs: 'floor',
    });
  });

  it('takes what was said, then Your numbers, then runs the comparison', () => {
    expect(resolveSpendingFlexibility({ stated: { percent: 30 }, statedFigures: saved(10), annualSpending: 50_000 }))
      .toMatchObject({ kind: 'cut', cutShare: 0.3, origin: 'stated' });
    expect(resolveSpendingFlexibility({ statedFigures: saved(10), annualSpending: 50_000 }))
      .toEqual({ kind: 'cut', cutShare: 0.1, annualCut: 5_000, origin: 'saved', savedAt: SAVED_AT });
    expect(resolveSpendingFlexibility({ annualSpending: 50_000 }))
      .toEqual({ kind: 'comparison', cutShare: 0.2, annualCut: 10_000 });
    // No spending level, nothing to cut.
    expect(resolveSpendingFlexibility({ stated: { percent: 20 }, annualSpending: undefined })).toBeUndefined();
  });

  it('treats a stated or saved zero, or a floor above spending, as no cut and no comparison', () => {
    expect(resolveSpendingFlexibility({ stated: { percent: 0 }, annualSpending: 60_000 })).toEqual({ kind: 'none', origin: 'stated' });
    expect(resolveSpendingFlexibility({ stated: { essentialAnnual: 70_000 }, annualSpending: 60_000 }))
      .toEqual({ kind: 'none', origin: 'stated' });
    expect(resolveSpendingFlexibility({ statedFigures: saved(0), annualSpending: 60_000 }))
      .toEqual({ kind: 'none', origin: 'saved', savedAt: SAVED_AT });
    expect(spendingFlexibilityInput({ kind: 'none', origin: 'stated' })).toEqual({});
  });

  it('drops a cut no plan can be built on, falling back to what was saved', () => {
    // 90% of spending, or more than the plan spends, is a misreading.
    expect(resolveSpendingFlexibility({ stated: { percent: 90 }, statedFigures: saved(15), annualSpending: 60_000 }))
      .toMatchObject({ kind: 'cut', cutShare: 0.15, origin: 'saved', ignoredStated: true });
    expect(resolveSpendingFlexibility({ stated: { annualAmount: 80_000 }, annualSpending: 60_000 }))
      .toMatchObject({ kind: 'comparison', ignoredStated: true });
    // Nothing said is nothing set aside.
    expect(resolveSpendingFlexibility({ stated: {}, annualSpending: 60_000 })).not.toHaveProperty('ignoredStated');
    expect(resolveSpendingFlexibility({ annualSpending: 60_000 })).not.toHaveProperty('ignoredStated');
  });

  it('says why a stated cut was set aside, before what the plan ran instead', () => {
    const resolution = resolveSpendingFlexibility({ stated: { essentialAnnual: 10_000 }, annualSpending: 60_000 });
    const comparison = {
      cutShare: 0.2, triggerDrawdown: 0.2, survivalRate: 0.9, sequencesTested: 500, sequencesSurvived: 450,
      sequencesWithCuts: 100, medianYearsCut: 5, mostYearsCut: 12,
    };
    const text = describeSpendingFlexibilityResults({ resolution, comparison, survivalRate: 0.8 });
    expect(text).toMatch(/^ I did not use the spending cut you described: it comes to more than 75% of the plan's spending, which I took as a misreading\. If you cut spending 20%/);
    // Even when there is no comparison to report.
    expect(describeSpendingFlexibilityResults({ resolution, comparison, survivalRate: 1 }))
      .toBe(' I did not use the spending cut you described: it comes to more than 75% of the plan\'s spending, which I took as a misreading.');
    expect(describeSpendingFlexibilityResults({
      resolution: resolveSpendingFlexibility({ annualSpending: 60_000 }), comparison, survivalRate: 1,
    })).toBe('');
  });

  it('hands the engine the user\'s cut, or the comparison beside fixed spending', () => {
    expect(spendingFlexibilityInput(resolveSpendingFlexibility({ stated: { percent: 20 }, annualSpending: 60_000 })))
      .toEqual({ spendingFlexibility: { cutShare: 0.2 } });
    expect(spendingFlexibilityInput(resolveSpendingFlexibility({ annualSpending: 60_000 })))
      .toEqual({ spendingFlexibilityComparison: { cutShare: 0.2 } });
  });

  it('offers only a cut the user stated, as a whole percent', () => {
    expect(savableSpendingCut(resolveSpendingFlexibility({ stated: { essentialAnnual: 50_000 }, annualSpending: 60_000 }))).toBe(17);
    expect(savableSpendingCut(resolveSpendingFlexibility({ stated: { percent: 0 }, annualSpending: 60_000 }))).toBe(0);
    expect(savableSpendingCut(resolveSpendingFlexibility({ statedFigures: saved(10), annualSpending: 60_000 }))).toBeUndefined();
    expect(savableSpendingCut(resolveSpendingFlexibility({ annualSpending: 60_000 }))).toBeUndefined();

    expect(acceptedFigureValue('spendingCutPercent', 20)).toBe(20);
    expect(acceptedFigureValue('spendingCutPercent', 20.5)).toBeUndefined();
    expect(acceptedFigureValue('spendingCutPercent', 80)).toBeUndefined();
    expect(buildSaveOffer('stated_retirement_plan', [{ key: 'spendingCutPercent', value: 20 }], {})?.items).toEqual([
      { key: 'spendingCutPercent', label: 'You could cut spending in a bad market by', value: 20, display: '20%' },
    ]);
  });

  it('reads the planner\'s fields, in whichever form the user used', () => {
    const inputs = validateExtractedInputs({ spendingCutPercent: 20, sources: { spendingCutPercent: 'cut 20% if we had to' } });
    expect(statedSpendingCutOf(inputs)).toEqual({ percent: 20 });
    expect(inputs.sources.spendingCutPercent).toBe('cut 20% if we had to');
    expect(statedSpendingCutOf(validateExtractedInputs({ essentialAnnualSpending: 48_000, sources: {} }))).toEqual({ essentialAnnual: 48_000 });
    expect(statedSpendingCutOf(validateExtractedInputs({ spendingCutPercent: 0, sources: {} }))).toEqual({ percent: 0 });
    expect(statedSpendingCutOf(validateExtractedInputs({ spendingCutPercent: 120, sources: {} }))).toBeUndefined();
    expect(statedSpendingCutOf(validateExtractedInputs({ sources: {} }))).toBeUndefined();
  });
});
