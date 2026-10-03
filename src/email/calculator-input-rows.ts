/**
 * What a calculator visitor entered, as label/value rows for the "result
 * ready" email (`email/calculator-ready.ts`).
 *
 * Inputs only. No calculator email states a result: the answer opens in Ask
 * Linc, and these rows are what make the message recognisably the visitor's.
 */

import type { CoastFireResult } from '../services/coast-fire';
import type { RetirementQuickPlanResult } from '../services/retirement-quickplan';

function dollars(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function coastFireInputRows(result: CoastFireResult): Array<[string, string]> {
  return [
    ['Your age today', `${result.currentAge}`],
    ['Retirement age', `${result.retirementAge}`],
    ['Retirement savings today', dollars(result.currentSavings)],
    ['Annual spending in retirement', dollars(result.annualRetirementSpending)],
    ['Annual income available at retirement', dollars(result.annualRetirementIncome)],
    ['Expected real return', `${result.realReturnRate}%`],
    ['Withdrawal rate', `${result.withdrawalRate}%`],
  ];
}

export function retirementInputRows(result: RetirementQuickPlanResult): Array<[string, string]> {
  const { inputs, allocation } = result;
  return [
    ['Your age today', `${inputs.currentAge}`],
    ['Retirement age', `${inputs.retirementAge}`],
    ['Investment assets today', money(inputs.investableAssets)],
    ['Annual spending in retirement', money(inputs.annualSpending)],
    ['Annual saving until retirement', money(inputs.annualContributions)],
    ['Social Security', inputs.socialSecurityAnnual > 0
      ? `${money(inputs.socialSecurityAnnual)} from age ${inputs.socialSecurityStartAge}`
      : 'None entered'],
    ['Asset mix', `${allocation.label} · ${allocation.equityPercent}% equities`],
    ['Planning through age', `${inputs.lifeExpectancy}`],
  ];
}
