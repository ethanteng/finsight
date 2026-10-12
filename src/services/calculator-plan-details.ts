/**
 * The details a free calculator run leaves out, as the form its first
 * decision carries.
 *
 * Both public calculators now show their answer on the page. Beside it they
 * show, greyed out under one lock, the figures Ask Linc plans with that the
 * calculator never asked for: what is still being saved, Social Security and
 * a pension on their own timing, a partner, taxes and health coverage. An
 * email address and a password unlock them, and this is what unlocking opens
 * on: the run as the account's first decision, with those same details as an
 * all-optional form under the answer.
 *
 * Submitting it is the ordinary `input_request` path. The client writes one
 * sentence per filled field and sends them as the user's next message in the
 * decision, so the planner reads them like anything else the user types and
 * the calculators run again with them. Nothing here computes or stores a
 * figure.
 *
 * The fields are what the run's own inputs do not already say, so the form
 * never asks for a figure the visitor just entered. The retirement calculator
 * took Social Security and contributions; Coast FIRE did not.
 *
 * Coast FIRE's one income figure is the exception that needs care. The
 * calculator took a single amount "that starts on your retirement date",
 * which may be Social Security, a pension, or both. Offering Social Security
 * and a pension beside it would invite the planner to count the same dollars
 * twice, and it is told never to work out a remainder the user did not state.
 * So a run with that income asks only when it starts and whether it rises
 * with inflation, naming the amount in the sentence so the planner ties the
 * answer to it; a run without one asks for both incomes from scratch.
 */

import { buildOptionalInputRequest, type InputFieldSpec, type InputRequest } from '../openai/input-request';
import { PARTNER_AGE_FIELD, PARTNER_MARRIED_FIELD } from '../openai/household-evidence';
import {
  COVERAGE_FIELD,
  IN_SPENDING_FIELD,
  ROTH_FIELD,
  STATE_FIELD,
  TAXABLE_FIELD,
} from '../openai/tax-healthcare-evidence';
import { COAST_FIRE_CALCULATOR_ID } from '../scenarios/coast-fire-scenario';
import { STATED_RETIREMENT_PLAN_CALCULATOR_ID } from '../scenarios/stated-retirement-plan-scenario';
import { DEFAULT_LIFE_EXPECTANCY, DEFAULT_SOCIAL_SECURITY_START_AGE } from './retirement-quickplan';
import { STATED_FIGURE_DEFINITIONS } from './stated-figures';
import type { CalculatorLead } from './calculator-first-decision';
import type { CoastFireLeadRecord } from './coast-fire-leads';
import type { RetirementLeadRecord } from './retirement-leads';

const TITLE = 'Add the details that change the answer';
const SUBMIT_LABEL = 'Run it again with these';

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function bounds(key: keyof typeof STATED_FIGURE_DEFINITIONS): { minimum?: number; maximum?: number } {
  const { minimum, maximum } = STATED_FIGURE_DEFINITIONS[key];
  return { ...(minimum !== undefined && { minimum }), ...(maximum !== undefined && { maximum }) };
}

const INCOME_INFLATION_OPTIONS = [
  { value: 'fixed', label: 'a fixed amount that does not rise with inflation' },
  { value: 'rises_with_inflation', label: 'adjusted for inflation' },
] as const;

/* ---- Your plan --------------------------------------------------- */

const PLAN_THROUGH_FIELD: InputFieldSpec = {
  id: 'lifeExpectancy',
  label: 'Plan through age',
  kind: 'age',
  ...bounds('planThroughAge'),
  sentence: 'Plan through age {value}.',
  defaultNote: `${DEFAULT_LIFE_EXPECTANCY} if left blank`,
};

const SPENDING_CUT_FIELD: InputFieldSpec = {
  id: 'spendingCutPercent',
  label: 'How much of your spending could you cut in a bad market?',
  kind: 'percent',
  ...bounds('spendingCutPercent'),
  sentence: 'In a bad market, I could cut my retirement spending by {value}.',
  defaultNote: 'If left blank, I keep your spending fixed and show a 20% cut beside it',
};

/** Coast FIRE's own wording for a contribution, so a re-run reads it the same way. */
const CONTRIBUTION_FIELD: InputFieldSpec = {
  id: 'annualContribution',
  label: 'What you save a year until you retire',
  kind: 'usd_per_year',
  ...bounds('annualContribution'),
  sentence: 'I invest {value} a year now.',
  defaultNote: 'Optional: shows when you could stop adding to it',
};

const SOCIAL_SECURITY_FIELDS: InputFieldSpec[] = [
  {
    id: 'socialSecurityAnnual',
    label: 'Social Security a year',
    kind: 'usd_per_year',
    ...bounds('socialSecurityAnnual'),
    sentence: 'I expect {value} a year from Social Security, in today\'s dollars.',
    defaultNote: 'None if left blank',
  },
  {
    id: 'socialSecurityStartAge',
    label: 'Age Social Security starts',
    kind: 'age',
    ...bounds('socialSecurityStartAge'),
    sentence: 'My Social Security starts at {value}.',
    defaultNote: `${DEFAULT_SOCIAL_SECURITY_START_AGE} if left blank`,
  },
];

/** A pension from scratch, in the sentences both calculators' own forms use. */
function pensionFields(ids: { amount: string; startAge: string; inflation: string }): InputFieldSpec[] {
  return [
    {
      id: ids.amount,
      label: 'Pension or other income a year',
      kind: 'usd_per_year',
      ...bounds('retirementIncome'),
      sentence: 'I expect a pension or other income of {value} a year.',
      defaultNote: 'None if left blank',
    },
    {
      id: ids.startAge,
      label: 'Age the pension starts',
      kind: 'age',
      ...bounds('retirementIncomeStartAge'),
      sentence: 'My pension starts at {value}.',
      defaultNote: 'When you retire, if left blank',
    },
    {
      id: ids.inflation,
      label: 'Does the pension rise with inflation?',
      kind: 'choice',
      options: INCOME_INFLATION_OPTIONS,
      sentence: 'My pension is {value}.',
      defaultNote: 'A fixed amount if left blank',
    },
  ];
}

/** The timing of the one income Coast FIRE took, tied to its amount. See the header. */
function statedIncomeFields(annualIncome: number): InputFieldSpec[] {
  const income = `The ${money(annualIncome)} a year of retirement income I mentioned`;
  return [
    {
      id: 'retirementIncomeStartAge',
      label: 'Age that income starts',
      kind: 'age',
      ...bounds('retirementIncomeStartAge'),
      sentence: `${income} starts at age {value}.`,
      defaultNote: 'When you retire, if left blank',
    },
    {
      id: 'retirementIncomeInflation',
      label: 'Does that income rise with inflation?',
      kind: 'choice',
      options: INCOME_INFLATION_OPTIONS,
      sentence: `${income} is {value}.`,
      defaultNote: 'A fixed amount if left blank',
    },
  ];
}

/* ---- A partner --------------------------------------------------- */

const PARTNER_FIELDS: InputFieldSpec[] = [
  PARTNER_AGE_FIELD,
  PARTNER_MARRIED_FIELD,
  {
    id: 'partnerSocialSecurityAnnual',
    label: 'Their Social Security a year',
    kind: 'usd_per_year',
    ...bounds('partnerSocialSecurityAnnual'),
    sentence: 'My partner expects {value} a year from Social Security, in today\'s dollars.',
  },
  {
    id: 'survivorAnnualSpending',
    label: 'What one of you would spend a year alone',
    kind: 'usd_per_year',
    ...bounds('survivorAnnualSpending'),
    sentence: 'If one of us were on our own, they would spend {value} a year, in today\'s dollars.',
    defaultNote: 'If left blank, I assume what you spend together',
  },
];

/* ---- Taxes and health coverage ----------------------------------- */

const TAX_AND_HEALTH_FIELDS: InputFieldSpec[] = [
  ROTH_FIELD,
  TAXABLE_FIELD,
  STATE_FIELD,
  COVERAGE_FIELD,
  IN_SPENDING_FIELD,
];

function coastFirePlanDetails(lead: CoastFireLeadRecord): InputRequest {
  const income = lead.inputs.annualRetirementIncome;
  return buildOptionalInputRequest({
    calculatorId: COAST_FIRE_CALCULATOR_ID,
    title: TITLE,
    // The decision's own question, so the re-run answers what was asked.
    question: 'Have I reached Coast FIRE?',
    submitLabel: SUBMIT_LABEL,
    fields: [
      CONTRIBUTION_FIELD,
      PLAN_THROUGH_FIELD,
      ...(income > 0
        ? statedIncomeFields(income)
        : [
          ...SOCIAL_SECURITY_FIELDS,
          ...pensionFields({
            amount: 'annualRetirementIncome',
            startAge: 'retirementIncomeStartAge',
            inflation: 'retirementIncomeInflation',
          }),
        ]),
      SPENDING_CUT_FIELD,
      ...PARTNER_FIELDS,
      ...TAX_AND_HEALTH_FIELDS,
    ],
  });
}

function retirementPlanDetails(lead: RetirementLeadRecord): InputRequest {
  return buildOptionalInputRequest({
    calculatorId: STATED_RETIREMENT_PLAN_CALCULATOR_ID,
    title: TITLE,
    question: `Can I retire at ${lead.inputs.retirementAge}?`,
    submitLabel: SUBMIT_LABEL,
    fields: [
      PLAN_THROUGH_FIELD,
      ...pensionFields({ amount: 'pensionAnnual', startAge: 'pensionStartAge', inflation: 'pensionInflation' }),
      SPENDING_CUT_FIELD,
      ...PARTNER_FIELDS,
      ...TAX_AND_HEALTH_FIELDS,
    ],
  });
}

/** The all-optional form a calculator run's first decision carries. */
export function planDetailsInputRequest(resolved: CalculatorLead): InputRequest {
  return resolved.kind === 'retirement'
    ? retirementPlanDetails(resolved.lead)
    : coastFirePlanDetails(resolved.lead);
}
