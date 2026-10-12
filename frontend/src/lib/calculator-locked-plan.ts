/**
 * What each public calculator shows, greyed out and locked, beside its result.
 *
 * These are Your numbers' own fields (labels included), so the preview is the
 * set of details the visitor then meets in Ask Linc rather than a list of
 * features. Each calculator shows only what its own form did not ask for: the
 * retirement calculator already took Social Security and contributions, and
 * Coast FIRE took one income figure whose timing is the open question.
 *
 * Four to a group, the ones that move the answer most first: enough to show
 * what is locked without a pane twice the height of the result beside it.
 * The run's first decision carries the full set as a form under the answer
 * (`src/services/calculator-plan-details.ts` on the server). The two are
 * separate TypeScript projects, so each keeps its own list; the groups are the
 * same on both sides.
 */

import { COST_FIELDS, PARTNER_FIELDS, PLAN_FIELDS, type YourNumbersField } from './your-numbers-fields';
import type { StatedFigureKey } from './your-numbers';

export interface LockedPlanField {
  id: StatedFigureKey;
  label: string;
  kind: YourNumbersField['kind'];
}

export interface LockedPlanGroup {
  title: string;
  fields: LockedPlanField[];
}

const ALL_FIELDS = new Map<StatedFigureKey, YourNumbersField & { id: StatedFigureKey }>(
  [...PLAN_FIELDS, ...PARTNER_FIELDS, ...COST_FIELDS].map((field) => [field.id, field]),
);

function pick(ids: StatedFigureKey[], labels: Partial<Record<StatedFigureKey, string>> = {}): LockedPlanField[] {
  return ids.flatMap((id) => {
    const field = ALL_FIELDS.get(id);
    return field ? [{ id, label: labels[id] ?? field.label, kind: field.kind }] : [];
  });
}

const PARTNER_GROUP: LockedPlanGroup = {
  title: 'Your partner',
  fields: pick(['partnerAge', 'partnerMarried', 'partnerSocialSecurityAnnual', 'survivorAnnualSpending']),
};

const COSTS_GROUP: LockedPlanGroup = {
  title: 'Taxes and health coverage',
  fields: pick(['rothSavingsPercent', 'taxableSavingsPercent', 'stateIncomeTaxPercent', 'preMedicareCoverage']),
};

/**
 * Coast FIRE's details. With an income entered, only its timing: offering
 * Social Security and a pension beside that one figure would invite the same
 * dollars to be counted twice. Without one, both incomes from scratch.
 */
export function coastFireLockedPlan(hasRetirementIncome: boolean): LockedPlanGroup[] {
  return [
    {
      title: 'Your retirement plan',
      fields: hasRetirementIncome
        ? pick(
          ['annualContribution', 'retirementIncomeStartAge', 'retirementIncomeInflation', 'spendingCutPercent'],
          {
            retirementIncomeStartAge: 'Age that income starts',
            retirementIncomeInflation: 'Does that income rise with inflation?',
          },
        )
        : pick(['annualContribution', 'socialSecurityAnnual', 'socialSecurityStartAge', 'retirementIncome']),
    },
    PARTNER_GROUP,
    COSTS_GROUP,
  ];
}

/** The retirement calculator's details: what its six numbers leave out. */
export const RETIREMENT_LOCKED_PLAN: LockedPlanGroup[] = [
  {
    title: 'Your retirement plan',
    fields: pick(['retirementIncome', 'retirementIncomeStartAge', 'spendingCutPercent', 'planThroughAge']),
  },
  PARTNER_GROUP,
  COSTS_GROUP,
];
