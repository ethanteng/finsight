import { describe, expect, it } from '@jest/globals';
import {
  buildQuickPlanReport,
  type QuickPlanRunRow,
} from '../../services/retirement-quickplan-report';
import { readSubmittedPlan } from '../../services/retirement-quickplan-log';

function row(overrides: Partial<QuickPlanRunRow> = {}): QuickPlanRunRow {
  return {
    outcome: 'plan',
    rejectedField: null,
    assumedFields: [],
    missingFields: [],
    currentAge: 52,
    retirementAge: 62,
    investableAssets: 1_200_000,
    annualSpending: 95_000,
    annualContributions: 35_000,
    socialSecurityAnnual: 36_000,
    socialSecurityStartAge: 67,
    allocation: 'balanced',
    survivalRate: 0.92,
    durationMs: 900,
    cached: false,
    createdAt: new Date('2026-09-10T12:00:00.000Z'),
    ...overrides,
  };
}

describe('retirement calculator report', () => {
  it('separates a verdict, a rates answer, and a refusal', () => {
    const report = buildQuickPlanReport(
      [
        row(),
        row({ outcome: 'rates', missingFields: ['investableAssets'], survivalRate: null, investableAssets: null }),
        row({ outcome: 'rejected', rejectedField: 'investableAssets', investableAssets: 0, survivalRate: null }),
      ],
      28
    );

    expect(report.totals).toMatchObject({
      runs: 3,
      answeredWithVerdict: 1,
      answeredWithRates: 1,
      rejected: 1,
    });
    // Two of three submissions produced an answer, which is the number the
    // whole exercise is about.
    expect(report.totals.answerRate).toBeCloseTo(2 / 3, 10);
  });

  it('names the field behind each refusal and each blank', () => {
    const report = buildQuickPlanReport(
      [
        row({ outcome: 'rejected', rejectedField: 'investableAssets' }),
        row({ outcome: 'rejected', rejectedField: 'investableAssets' }),
        row({ outcome: 'rejected', rejectedField: 'currentAge' }),
        row({ outcome: 'rates', missingFields: ['annualSpending'], assumedFields: ['retirementAge'] }),
      ],
      28
    );

    expect(report.rejectionsByField[0]).toMatchObject({ label: 'investableAssets', count: 2 });
    expect(report.rejectionsByField[1]).toMatchObject({ label: 'currentAge', count: 1 });
    expect(report.blanksByField).toEqual([{ label: 'annualSpending', count: 1, share: 1 }]);
    expect(report.assumptionsByField).toEqual([{ label: 'retirementAge', count: 1, share: 1 }]);
  });

  it('bands the figures low to high rather than averaging them', () => {
    const report = buildQuickPlanReport(
      [
        row({ investableAssets: 50_000 }),
        row({ investableAssets: 750_000 }),
        row({ investableAssets: 1_500_000 }),
        row({ investableAssets: 9_000_000 }),
      ],
      28
    );
    const labels = report.distributions.investableAssets.map((entry) => entry.label);

    expect(labels).toEqual(['under $100k', '$500k–$1M', '$1M–$2M', '$5M+']);
    // A mean here would be dominated by the one large portfolio and would say
    // nothing about who the page reaches.
    expect(report.distributions.investableAssets.every((entry) => entry.share === 0.25)).toBe(true);
  });

  it('reads survival only from runs that claimed a verdict', () => {
    const report = buildQuickPlanReport(
      [row({ survivalRate: 0.45 }), row({ outcome: 'rates', survivalRate: null })],
      28
    );

    expect(report.distributions.survivalRate).toEqual([{ label: 'under 50%', count: 1, share: 1 }]);
  });

  it('reports a day at a time, oldest first', () => {
    const report = buildQuickPlanReport(
      [
        row({ createdAt: new Date('2026-09-09T08:00:00.000Z') }),
        row({ createdAt: new Date('2026-09-10T08:00:00.000Z'), outcome: 'rejected', rejectedField: 'currentAge' }),
        row({ createdAt: new Date('2026-09-10T20:00:00.000Z') }),
      ],
      28
    );

    expect(report.daily).toEqual([
      { date: '2026-09-09', runs: 1, rejected: 0, answerRate: 1 },
      { date: '2026-09-10', runs: 2, rejected: 1, answerRate: 0.5 },
    ]);
  });

  it('says so when the window was clipped rather than quoting a rate over a subset', () => {
    const complete = buildQuickPlanReport([row()], 28);
    const clipped = buildQuickPlanReport([row()], 28, true);

    expect(complete.truncated).toBe(false);
    expect(clipped.truncated).toBe(true);
  });

  it('survives an empty window without dividing by zero', () => {
    const report = buildQuickPlanReport([], 7);

    expect(report.totals).toMatchObject({ runs: 0, answerRate: 0, cachedShare: 0, medianDurationMs: null });
    expect(report.daily).toEqual([]);
    expect(report.distributions.investableAssets).toEqual([]);
  });
});

describe('reading back what the visitor submitted', () => {
  it('keeps a blank distinguishable from a zero', () => {
    const submitted = readSubmittedPlan({
      currentAge: 52, investableAssets: '', annualContributions: 0, allocation: 'growth',
    });

    // Blank means the model assumed or answered around it; zero is an answer.
    expect(submitted.investableAssets).toBeNull();
    expect(submitted.annualContributions).toBe(0);
    expect(submitted.currentAge).toBe(52);
    expect(submitted.allocation).toBe('growth');
    expect(submitted.annualSpending).toBeNull();
  });

  it('records what was typed even when the model will refuse it', () => {
    // The row has to say why a visitor was turned away, so an out-of-range
    // figure is read back rather than dropped.
    const submitted = readSubmittedPlan({ investableAssets: 0, currentAge: 4, annualSpending: '1,234' });

    expect(submitted.investableAssets).toBe(0);
    expect(submitted.currentAge).toBe(4);
    expect(submitted.annualSpending).toBe(1234);
  });

  it('reads a non-object body as an empty submission rather than throwing', () => {
    expect(readSubmittedPlan(null).currentAge).toBeNull();
    expect(readSubmittedPlan('nope').allocation).toBeNull();
    expect(readSubmittedPlan({ currentAge: 'soon' }).currentAge).toBeNull();
  });
});
