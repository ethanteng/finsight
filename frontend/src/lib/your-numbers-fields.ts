/**
 * The retirement plan fields Your numbers edits, with the labels, bounds and
 * hints the page shows (see `src/services/stated-figures.ts` for the bounds the
 * server enforces).
 *
 * They live here rather than in the page because the public calculators show
 * the same fields, greyed out, as what Ask Linc adds once someone has an
 * account. One copy keeps the preview's labels the ones the visitor then meets.
 */

import type { DisplayInputRequestField } from './input-request';
import type { StatedFigureKey } from './your-numbers';

export type YourNumbersField = DisplayInputRequestField & { hint?: string };

/** The plan's fields, with the bounds Your numbers accepts (see `src/services/stated-figures.ts`). */
export const PLAN_FIELDS: Array<YourNumbersField & { id: StatedFigureKey }> = [
  { id: 'retirementAge', label: 'Age you plan to retire', kind: 'age', required: false, minimum: 30, maximum: 95, sentence: '{value}', hint: 'Linc assumes 65 until you set one.' },
  { id: 'annualRetirementSpending', label: 'What you expect to spend a year in retirement', kind: 'usd_per_year', required: false, minimum: 1_000, maximum: 10_000_000, sentence: '{value}', hint: 'In today\'s dollars.' },
  { id: 'annualContribution', label: 'What you save a year until you retire', kind: 'usd_per_year', required: false, minimum: 0, maximum: 5_000_000, sentence: '{value}' },
  { id: 'retirementIncome', label: 'Pension or other income a year', kind: 'usd_per_year', required: false, minimum: 0, maximum: 10_000_000, sentence: '{value}', hint: 'Not Social Security; that has its own line.' },
  { id: 'retirementIncomeStartAge', label: 'Age the pension starts', kind: 'age', required: false, minimum: 30, maximum: 95, sentence: '{value}', hint: 'Linc assumes it starts when you retire.' },
  {
    id: 'retirementIncomeInflation',
    label: 'Does the pension rise with inflation?',
    kind: 'choice',
    required: false,
    options: [
      { value: 'fixed', label: 'No, it is a fixed amount' },
      { value: 'rises_with_inflation', label: 'Yes, it has a cost-of-living adjustment' },
    ],
    sentence: '{value}',
    hint: 'Linc assumes a fixed amount, which buys less each year prices rise.',
  },
  { id: 'socialSecurityAnnual', label: 'Social Security a year', kind: 'usd_per_year', required: false, minimum: 0, maximum: 250_000, sentence: '{value}' },
  { id: 'socialSecurityStartAge', label: 'Age Social Security starts', kind: 'age', required: false, minimum: 50, maximum: 80, sentence: '{value}', hint: 'Linc assumes 67.' },
  { id: 'planThroughAge', label: 'Plan through age', kind: 'age', required: false, minimum: 60, maximum: 110, sentence: '{value}', hint: 'Linc assumes 95.' },
  {
    id: 'spendingCutPercent',
    label: 'How much of your spending could you cut in a bad market?',
    kind: 'percent',
    integer: true,
    required: false,
    minimum: 0,
    maximum: 75,
    sentence: '{value}',
    hint: 'Linc cuts spending by this much in any year your portfolio starts more than 20% below its inflation-adjusted value when withdrawals began. Enter 0 if you could not cut.',
  },
  {
    id: 'allocation',
    label: 'Preset mix for market-history tests',
    kind: 'choice',
    required: false,
    options: [
      { value: 'conservative', label: 'Conservative (40% stocks)' },
      { value: 'balanced', label: 'Balanced (60% stocks)' },
      { value: 'growth', label: 'Growth (80% stocks)' },
    ],
    sentence: '{value}',
    hint: 'Used until your linked holdings can be tested instead. Balanced until you choose.',
  },
];

/**
 * A spouse or partner, for plans that should run for two. Linc counts their
 * incomes from their own ages and runs the plan until the later of your
 * planning ages. Married, it also counts Social Security's spousal benefit
 * and, at the first death, its survivor benefit (see `src/services/household.ts`).
 */
export const PARTNER_FIELDS: Array<YourNumbersField & { id: StatedFigureKey }> = [
  { id: 'partnerAge', label: 'Your partner\'s age', kind: 'age', required: false, minimum: 18, maximum: 90, sentence: '{value}', hint: 'Leave blank if you plan alone.' },
  {
    id: 'partnerMarried',
    label: 'Are you married?',
    kind: 'choice',
    required: false,
    options: [
      { value: 'married', label: 'Yes, we are married' },
      { value: 'not_married', label: 'No, we are not married' },
    ],
    sentence: '{value}',
    hint: 'Social Security pays spousal and survivor benefits only to a married couple. Linc counts neither until it knows.',
  },
  { id: 'partnerSocialSecurityAnnual', label: 'Their Social Security a year', kind: 'usd_per_year', required: false, minimum: 0, maximum: 250_000, sentence: '{value}' },
  { id: 'partnerSocialSecurityStartAge', label: 'Their age when they claim it', kind: 'age', required: false, minimum: 50, maximum: 80, sentence: '{value}', hint: 'Linc assumes 67.' },
  { id: 'partnerRetirementIncome', label: 'Their pension or other income a year', kind: 'usd_per_year', required: false, minimum: 0, maximum: 10_000_000, sentence: '{value}' },
  { id: 'partnerRetirementIncomeStartAge', label: 'Their age when the pension starts', kind: 'age', required: false, minimum: 30, maximum: 95, sentence: '{value}', hint: 'Linc assumes it starts when you retire.' },
  {
    id: 'partnerRetirementIncomeInflation',
    label: 'Does their pension rise with inflation?',
    kind: 'choice',
    required: false,
    options: [
      { value: 'fixed', label: 'No, it is a fixed amount' },
      { value: 'rises_with_inflation', label: 'Yes, it has a cost-of-living adjustment' },
    ],
    sentence: '{value}',
    hint: 'Linc assumes a fixed amount.',
  },
  { id: 'partnerPlanThroughAge', label: 'Plan through their age', kind: 'age', required: false, minimum: 60, maximum: 110, sentence: '{value}', hint: 'Linc assumes 95.' },
  { id: 'survivorAnnualSpending', label: 'What one of you would spend a year alone', kind: 'usd_per_year', required: false, minimum: 1_000, maximum: 10_000_000, sentence: '{value}', hint: 'In today\'s dollars. Linc assumes the survivor spends what you spend together.' },
];

/**
 * How the savings are taxed and what health coverage costs: Linc counts
 * income tax on every year's withdrawals and health premiums from the first
 * withdrawal (see `src/services/retirement-taxes.ts` and
 * `src/services/retirement-healthcare.ts`). Linked accounts say how they are
 * taxed on their own; these cover what they do not.
 */
export const COST_FIELDS: Array<YourNumbersField & { id: StatedFigureKey }> = [
  { id: 'rothSavingsPercent', label: 'Share of your savings in Roth accounts', kind: 'percent', integer: true, required: false, minimum: 0, maximum: 100, sentence: '{value}', hint: 'Roth IRA, Roth 401(k). Linc counts savings it cannot place as pre-tax.' },
  { id: 'taxableSavingsPercent', label: 'Share in taxable brokerage accounts', kind: 'percent', integer: true, required: false, minimum: 0, maximum: 100, sentence: '{value}', hint: 'The rest is pre-tax: a traditional 401(k) or IRA.' },
  { id: 'stateIncomeTaxPercent', label: 'Your state income tax rate on retirement income', kind: 'percent', required: false, minimum: 0, maximum: 15, sentence: '{value}', hint: 'Linc counts none in a state without income tax, and none until you set one elsewhere.' },
  {
    id: 'preMedicareCoverage',
    label: 'Health coverage between retiring and Medicare',
    kind: 'choice',
    required: false,
    options: [
      { value: 'marketplace', label: 'A marketplace (ACA) plan' },
      { value: 'cobra', label: 'COBRA, then a marketplace plan' },
      { value: 'employer_retiree', label: 'Retiree coverage from an employer' },
      { value: 'spouse_plan', label: 'A spouse\'s employer plan' },
    ],
    sentence: '{value}',
    hint: 'Linc assumes a marketplace plan, less the premium tax credit your income earns.',
  },
  { id: 'preMedicareAnnualPremium', label: 'What that coverage costs a year per person', kind: 'usd_per_year', required: false, minimum: 0, maximum: 100_000, sentence: '{value}', hint: 'Leave blank and Linc prices the coverage you chose.' },
  {
    id: 'healthcareInSpending',
    label: 'Does your retirement spending already include health premiums?',
    kind: 'choice',
    required: false,
    options: [
      { value: 'not_included', label: 'No, add premiums on top' },
      { value: 'included', label: 'Yes, it already includes them' },
    ],
    sentence: '{value}',
    hint: 'Linc adds them on top until you say.',
  },
];
