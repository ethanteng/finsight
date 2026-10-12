/**
 * How every retirement calculator states income tax and health premiums: the
 * clauses its assumptions list, the sentence that reports what they cost in
 * the first year of withdrawals, the ask for whatever Linc had to assume, the
 * form for it, and the facts an answer may quote. One wording, so the
 * holdings projection, the stated plan and Coast FIRE read the same.
 *
 * Every figure is the engine's or a resolved input; the model never estimates
 * a tax or a premium.
 */

import { resolveRetirementTaxes, savableAccountSplit, type RetirementTaxResolution } from '../services/retirement-taxes';
import { resolveHealthcare, type HealthcareResolution } from '../services/retirement-healthcare';
import type { ResolvedPartner } from '../services/household';
import type { RetirementHealthcare, RetirementTaxes } from '../retirement-analytics/types';
import type { FinancialContextSnapshot } from './types';
import { MEDICARE_ANNUAL_PREMIUM, COBRA_MONTHS } from '../retirement-analytics/engine/healthcare';
import { TAX_FIGURES_YEAR } from '../retirement-analytics/engine/taxes';
import { EARLY_WITHDRAWAL_AGE } from '../retirement-analytics/engine/retirement-cash-plan';
import { savedOn, STATED_FIGURE_DEFINITIONS } from '../services/stated-figures';
import type { CanonicalFactUnit } from './canonical-facts';
import type { InputFieldSpec, InputRequest, InputRequestSpec } from './input-request';

/** The first withdrawal year's tax and premiums, medians in today's dollars. */
export interface FirstYearCosts {
  federalTax: number;
  stateTax: number;
  healthcarePremiums: number;
  premiumTaxCredit: number;
}

export interface TaxAndHealthcare {
  taxes?: RetirementTaxResolution;
  healthcare?: HealthcareResolution;
}

/**
 * Taxes and premiums for a calculator that runs on the user's stated figures
 * (the stated plan, Coast FIRE): the split the user stated in this decision,
 * then Your numbers, then all pre-tax; the state and coverage the same way.
 */
export function snapshotTaxAndHealthcare(
  snapshot: Pick<FinancialContextSnapshot,
    'statedAccountSplit' | 'statedStateTaxPercent' | 'statedHealthcare' | 'statedFigures' | 'userProfileValues'>,
  args: {
    /** The invested total stated amounts are read against. */
    total?: number;
    partner?: Pick<ResolvedPartner, 'married'> | null;
    preMedicareYears: boolean;
  }
): { taxes: RetirementTaxResolution; healthcare: HealthcareResolution } {
  return {
    taxes: resolveRetirementTaxes({
      stated: snapshot.statedAccountSplit,
      statedStatePercent: snapshot.statedStateTaxPercent,
      statedFigures: snapshot.statedFigures,
      total: args.total,
      partner: args.partner ?? null,
      stateOrProvince: snapshot.userProfileValues?.stateOrProvince,
      country: snapshot.userProfileValues?.country,
    }),
    healthcare: resolveHealthcare({
      stated: snapshot.statedHealthcare,
      statedFigures: snapshot.statedFigures,
      preMedicareYears: args.preMedicareYears,
    }),
  };
}

/** The engine's inputs for resolved taxes and premiums. */
export function taxAndHealthcareEngineInputs(resolutions: TaxAndHealthcare): { taxes?: RetirementTaxes; healthcare?: RetirementHealthcare } {
  return {
    ...(resolutions.taxes && { taxes: resolutions.taxes.taxes }),
    ...(resolutions.healthcare?.kind === 'counted' && { healthcare: resolutions.healthcare.healthcare }),
  };
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function share(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ratePercent(rate: number): string {
  const percent = Number((rate * 100).toFixed(2));
  return `${percent}%`;
}

function savedNote(savedAt: string | undefined): string {
  return savedAt ? ` (from Your numbers, saved ${savedOn(savedAt)})` : '';
}

const FILING_TEXT: Record<RetirementTaxResolution['filing']['origin'], string> = {
  no_partner: 'filing single',
  married: 'filing jointly',
  not_married: 'as two single returns, since you are not married',
  marriage_unknown: 'as two single returns, since you have not said whether you are married',
};

/** How the money was split, and where that came from. */
function accountsClause(resolution: RetirementTaxResolution): string {
  const { accounts } = resolution;
  if (accounts.origin === 'assumed') return 'all savings counted as pre-tax, the most heavily taxed kind (assumed)';
  const { pretax, taxable, roth } = accounts.shares;
  const split = [
    pretax > 0 ? `${share(pretax)} pre-tax` : null,
    taxable > 0 ? `${share(taxable)} taxable` : null,
    roth > 0 ? `${share(roth)} Roth` : null,
  ].filter(Boolean).join(', ');
  let where: string;
  if (accounts.origin === 'linked') {
    where = accounts.untypedOrigin === 'assumed'
      ? `by your linked accounts' types, counting the ${share(accounts.assumedPretaxShare)} whose account does not say as pre-tax`
      : accounts.untypedOrigin === 'stated'
        ? accounts.savedAt
          ? `by your linked accounts' types, as you described and from Your numbers for the rest${savedNote(accounts.savedAt)}`
          : 'by your linked accounts\' types, and as you described for the rest'
        : accounts.untypedOrigin === 'saved'
          ? `by your linked accounts' types, and as in Your numbers for the rest${savedNote(accounts.savedAt)}`
          : 'by your linked accounts\' types';
  } else if (accounts.origin === 'stated') {
    where = accounts.assumedPretaxShare > 0
      ? `as you described, counting the ${share(accounts.assumedPretaxShare)} you did not place as pre-tax`
      : accounts.savedAt
        ? `as you described, with the rest from Your numbers${savedNote(accounts.savedAt)}`
        : 'as you described';
  } else {
    where = accounts.savedAt ? `from Your numbers (saved ${savedOn(accounts.savedAt)})` : 'from Your numbers';
  }
  const basis = accounts.basisUnknown && taxable > 0
    ? '; taxable money with no cost basis on record counts as all gain when sold'
    : '';
  return `savings ${split} ${where}${basis}`;
}

function stateClause(resolution: RetirementTaxResolution): string {
  const { state } = resolution;
  if (state.kind === 'rate') {
    return state.origin === 'stated'
      ? `state income tax at ${ratePercent(state.rate)}, as you said`
      : `state income tax at ${ratePercent(state.rate)}${savedNote(state.savedAt)}`;
  }
  if (state.kind === 'none') return `no state income tax, since ${state.state} has none`;
  return 'no state income tax, since I do not know your state\'s rate';
}

/**
 * Income tax as a clause for an assumptions list: the rules, how the
 * household files, how the money is held and the state's rate. Null when the
 * run was untaxed.
 */
export function describeTaxes(
  resolution: RetirementTaxResolution | undefined,
  /** When withdrawals begin, as the user's age, for the additional tax on early pre-tax draws. */
  withdrawalStartAge?: number
): string | null {
  if (!resolution) return null;
  const early = withdrawalStartAge !== undefined && withdrawalStartAge < EARLY_WITHDRAWAL_AGE && resolution.taxes.accounts.pretax > 0
    ? ', and the 10% additional tax on pre-tax money drawn before 59½ (its exceptions, such as leaving an employer ' +
      'at 55 or later, are not counted)'
    : '';
  return `${TAX_FIGURES_YEAR} federal income tax on each year's withdrawals and income, ${FILING_TEXT[resolution.filing.origin]}, ` +
    `drawing taxable savings first, then pre-tax, then Roth, with required minimum distributions${early}; ` +
    `${accountsClause(resolution)}; ${stateClause(resolution)}`;
}

/** What coverage before 65 costs, as the clause names it. */
function coverageClause(healthcare: RetirementHealthcare): string {
  const { coverage, annualPremium } = healthcare;
  if (annualPremium !== undefined) {
    const name = coverage === 'employer_retiree'
      ? 'retiree coverage from an employer'
      : coverage === 'spouse_plan' ? 'a spouse\'s employer plan' : coverage === 'cobra' ? 'COBRA' : 'a marketplace plan';
    return `${name} at ${money(annualPremium)} a year each`;
  }
  if (coverage === 'cobra') {
    return `COBRA at the average employer premium for ${COBRA_MONTHS} months, then an average marketplace plan less the ` +
      'premium tax credit each year\'s income earns';
  }
  if (coverage === 'employer_retiree') return 'retiree coverage from an employer, at no premium since you have not said what it costs';
  if (coverage === 'spouse_plan') return 'a spouse\'s employer plan, at no premium';
  return 'an average marketplace plan less the premium tax credit each year\'s income earns';
}

/**
 * Health premiums as a clause for an assumptions list; null when the run
 * counted none for want of a resolution.
 */
export function describeHealthcare(resolution: HealthcareResolution | undefined): string | null {
  if (!resolution) return null;
  if (resolution.kind === 'included') {
    return `no separate health premiums, since your spending already includes them${resolution.origin === 'saved' ? savedNote(resolution.savedAt) : ''}`;
  }
  const onTop = `health premiums on top of your spending${resolution.inSpendingOrigin === 'default' ? ' (assumed)' : ''} ` +
    'from the first withdrawal';
  const medicare = `Medicare Part B and D (${money(MEDICARE_ANNUAL_PREMIUM)} a year each)`;
  if (!resolution.preMedicareYears) return `${onTop}: ${medicare}; premiums only, not deductibles`;
  const assumed = resolution.coverageOrigin === 'default'
    ? ' (assumed)'
    : resolution.coverageOrigin === 'saved' ? savedNote(resolution.savedAt) : '';
  return `${onTop}: before 65, ${coverageClause(resolution.healthcare)}${assumed}; from 65, ${medicare}; ` +
    'premiums only, not deductibles or Medicare\'s income surcharges';
}

/**
 * What tax and premiums cost in the first year of withdrawals, as a sentence;
 * empty when the run counted neither.
 */
export function describeFirstYearCosts(costs: FirstYearCosts | undefined, resolutions: TaxAndHealthcare): string {
  if (!costs) return '';
  const items: string[] = [];
  if (resolutions.taxes) {
    items.push(`${money(costs.federalTax)} of federal income tax`);
    if (resolutions.taxes.state.kind === 'rate' && resolutions.taxes.state.rate > 0) {
      items.push(`${money(costs.stateTax)} of state income tax`);
    }
  }
  if (resolutions.healthcare?.kind === 'counted') {
    items.push(costs.premiumTaxCredit > 0.5
      ? `${money(costs.healthcarePremiums)} of health premiums after a ${money(costs.premiumTaxCredit)} premium tax credit`
      : `${money(costs.healthcarePremiums)} of health premiums`);
  }
  if (items.length === 0) return '';
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return ` In the first year of withdrawals, at the median of the historical sequences, the plan pays ${list}, in today's dollars, ` +
    'on top of what it spends.';
}

/** What Linc had to assume about taxes and coverage, and the user could say. */
function unknowns(resolutions: TaxAndHealthcare): Array<'split' | 'state' | 'coverage' | 'inSpending'> {
  const asks: Array<'split' | 'state' | 'coverage' | 'inSpending'> = [];
  const taxes = resolutions.taxes;
  if (taxes && taxes.accounts.assumedPretaxShare > 0.005) asks.push('split');
  if (taxes?.state.kind === 'unknown') asks.push('state');
  const health = resolutions.healthcare;
  if (health?.kind === 'counted') {
    if (health.preMedicareYears && health.coverageOrigin === 'default') asks.push('coverage');
    if (health.inSpendingOrigin === 'default') asks.push('inSpending');
  }
  return asks;
}

const ASK_TEXT: Record<ReturnType<typeof unknowns>[number], string> = {
  split: 'how much of your savings is in Roth and in taxable accounts',
  state: 'your state income tax rate',
  coverage: 'what health coverage you will have before Medicare',
  inSpending: 'whether your spending already includes health premiums',
};

/** One sentence asking for what Linc assumed about taxes and coverage; empty when it assumed nothing. */
export function describeTaxAndHealthcareAsks(resolutions: TaxAndHealthcare): string {
  const asks = unknowns(resolutions).map((ask) => ASK_TEXT[ask]);
  if (asks.length === 0) return '';
  const list = asks.length === 1 ? asks[0] : `${asks.slice(0, -1).join(', ')} and ${asks[asks.length - 1]}`;
  return ` To make the tax and health figures yours, tell me ${list}.`;
}

const ROTH_FIELD: InputFieldSpec = {
  id: 'rothSavingsPercent',
  label: 'Share of your savings in Roth accounts',
  kind: 'percent',
  minimum: 0,
  maximum: 100,
  sentence: 'About {value} of my savings is in Roth accounts.',
  defaultNote: 'If left blank, I count it as pre-tax',
};

const TAXABLE_FIELD: InputFieldSpec = {
  id: 'taxableSavingsPercent',
  label: 'Share in taxable brokerage accounts',
  kind: 'percent',
  minimum: 0,
  maximum: 100,
  sentence: 'About {value} of my savings is in taxable brokerage accounts.',
  defaultNote: 'If left blank, I count it as pre-tax',
};

const STATE_FIELD: InputFieldSpec = {
  id: 'stateIncomeTaxPercent',
  label: 'Your state income tax rate on retirement income',
  kind: 'percent',
  minimum: STATED_FIGURE_DEFINITIONS.stateIncomeTaxPercent.minimum,
  maximum: STATED_FIGURE_DEFINITIONS.stateIncomeTaxPercent.maximum,
  sentence: 'My state income tax rate on retirement income is {value}.',
  defaultNote: 'If left blank, I count no state income tax',
};

const COVERAGE_FIELD: InputFieldSpec = {
  id: 'preMedicareCoverage',
  label: 'Health coverage before Medicare',
  kind: 'choice',
  options: [
    { value: 'marketplace', label: 'a marketplace (ACA) plan' },
    { value: 'cobra', label: 'COBRA from my last employer, then a marketplace plan' },
    { value: 'employer_retiree', label: 'retiree coverage from an employer' },
    { value: 'spouse_plan', label: 'my spouse\'s employer plan' },
  ],
  sentence: 'Before Medicare, my health coverage will be {value}.',
  defaultNote: 'If left blank, I assume a marketplace plan',
};

const IN_SPENDING_FIELD: InputFieldSpec = {
  id: 'healthcareInSpending',
  label: 'Does your retirement spending include health premiums?',
  kind: 'choice',
  options: [
    { value: 'included', label: 'already includes health premiums' },
    { value: 'not_included', label: 'does not include health premiums' },
  ],
  sentence: 'My retirement spending figure {value}.',
  defaultNote: 'If left blank, I add premiums on top',
};

/** The form fields for what Linc assumed about taxes and coverage. */
export function taxAndHealthcareFields(resolutions: TaxAndHealthcare): InputFieldSpec[] {
  const fields: InputFieldSpec[] = [];
  for (const ask of unknowns(resolutions)) {
    if (ask === 'split') fields.push(ROTH_FIELD, TAXABLE_FIELD);
    if (ask === 'state') fields.push(STATE_FIELD);
    if (ask === 'coverage') fields.push(COVERAGE_FIELD);
    if (ask === 'inSpending') fields.push(IN_SPENDING_FIELD);
  }
  return fields;
}

/** A calculator's form with the tax and coverage fields it assumed added, all optional. */
export function withTaxAndHealthcareFields(spec: InputRequestSpec, resolutions: TaxAndHealthcare): InputRequestSpec {
  const ids = new Set(spec.fields.map((field) => field.id));
  return { ...spec, fields: [...spec.fields, ...taxAndHealthcareFields(resolutions).filter((field) => !ids.has(field.id))] };
}

/**
 * The form a run that assumed something about taxes or coverage carries, for
 * those fields alone; every one is optional, since the run stands without
 * them. Null when nothing was assumed.
 */
export function taxAndHealthcareInputRequest(
  resolutions: TaxAndHealthcare,
  calculatorId: string,
  question: string
): InputRequest | null {
  const fields = taxAndHealthcareFields(resolutions);
  if (fields.length === 0) return null;
  return {
    calculatorId,
    title: 'Make the tax and health figures yours',
    question,
    submitLabel: 'Update my plan',
    fields: fields.map((field) => ({
      id: field.id,
      label: field.label,
      kind: field.kind,
      required: false,
      ...(field.minimum !== undefined && { minimum: field.minimum }),
      ...(field.maximum !== undefined && { maximum: field.maximum }),
      ...(field.options && { options: field.options.map((option) => ({ ...option })) }),
      ...(field.defaultNote && { defaultNote: field.defaultNote }),
      sentence: field.sentence,
    })),
  };
}

/** A fact a calculator publishes about taxes or premiums, before its own id prefix and source. */
export interface TaxHealthcareFactRow {
  suffix: string;
  label: string;
  value: number;
  unit: CanonicalFactUnit;
  /** Set on the engine's results; every other row is an input. */
  result?: true;
}

/** The resolved inputs and the first year's costs, as facts. */
export function taxAndHealthcareFactRows(resolutions: TaxAndHealthcare, costs: FirstYearCosts | undefined): TaxHealthcareFactRow[] {
  const rows: TaxHealthcareFactRow[] = [];
  const { taxes, healthcare } = resolutions;
  const median = 'in the first year of withdrawals, median across historical sequences, in today\'s dollars';
  if (taxes) {
    const { pretax, taxable, roth } = taxes.accounts.shares;
    rows.push(
      { suffix: 'tax_pretax_share', label: 'Share of savings taxed as pre-tax when withdrawn', value: Math.round(pretax * 1000) / 10, unit: 'percent' },
      { suffix: 'tax_taxable_share', label: 'Share of savings in taxable accounts', value: Math.round(taxable * 1000) / 10, unit: 'percent' },
      { suffix: 'tax_roth_share', label: 'Share of savings in Roth accounts', value: Math.round(roth * 1000) / 10, unit: 'percent' },
    );
    if (taxes.state.kind === 'rate') {
      rows.push({ suffix: 'tax_state_rate', label: 'State income tax rate on retirement income', value: Number((taxes.state.rate * 100).toFixed(2)), unit: 'percent' });
    }
    if (costs) {
      rows.push({ suffix: 'tax_first_year_federal', label: `Federal income tax ${median}`, value: Math.round(costs.federalTax), unit: 'usd', result: true });
      if (taxes.state.kind === 'rate' && taxes.state.rate > 0) {
        rows.push({ suffix: 'tax_first_year_state', label: `State income tax ${median}`, value: Math.round(costs.stateTax), unit: 'usd', result: true });
      }
    }
  }
  if (healthcare?.kind === 'counted') {
    rows.push({ suffix: 'medicare_annual_premium', label: 'Medicare Part B and Part D base premiums a year per person, 2026', value: Math.round(MEDICARE_ANNUAL_PREMIUM), unit: 'usd' });
    if (healthcare.healthcare.annualPremium !== undefined && healthcare.preMedicareYears) {
      rows.push({ suffix: 'pre_medicare_annual_premium', label: 'Health premium a year per person before Medicare, as stated', value: Math.round(healthcare.healthcare.annualPremium), unit: 'usd' });
    }
    if (costs) {
      rows.push({ suffix: 'healthcare_first_year_premiums', label: `Health premiums after any premium tax credit ${median}`, value: Math.round(costs.healthcarePremiums), unit: 'usd', result: true });
      if (costs.premiumTaxCredit > 0.5) {
        rows.push({ suffix: 'healthcare_first_year_premium_tax_credit', label: `Premium tax credit ${median}`, value: Math.round(costs.premiumTaxCredit), unit: 'usd', result: true });
      }
    }
  }
  return rows;
}

/**
 * What the user stated about taxes and coverage in this decision, as Your
 * numbers would keep it, for "Use these next time?". The split only when the
 * user placed all of it.
 */
export function savableTaxAndHealthcareFigures(resolutions: TaxAndHealthcare | undefined): Array<{
  key: 'rothSavingsPercent' | 'taxableSavingsPercent' | 'stateIncomeTaxPercent' | 'preMedicareCoverage' | 'preMedicareAnnualPremium' | 'healthcareInSpending';
  value: number | string;
}> {
  if (!resolutions) return [];
  const figures: ReturnType<typeof savableTaxAndHealthcareFigures> = [];
  const split = savableAccountSplit(resolutions.taxes?.accounts);
  if (split) {
    figures.push({ key: 'rothSavingsPercent', value: split.rothSavingsPercent });
    figures.push({ key: 'taxableSavingsPercent', value: split.taxableSavingsPercent });
  }
  const state = resolutions.taxes?.state;
  if (state?.kind === 'rate' && state.origin === 'stated') {
    figures.push({ key: 'stateIncomeTaxPercent', value: Number((state.rate * 100).toFixed(2)) });
  }
  const health = resolutions.healthcare;
  if (health?.kind === 'included' && health.origin === 'stated') figures.push({ key: 'healthcareInSpending', value: 'included' });
  if (health?.kind === 'counted') {
    if (health.inSpendingOrigin === 'stated') figures.push({ key: 'healthcareInSpending', value: 'not_included' });
    if (health.coverageOrigin === 'stated') figures.push({ key: 'preMedicareCoverage', value: health.healthcare.coverage });
    if (health.premiumOrigin === 'stated' && health.healthcare.annualPremium !== undefined) {
      figures.push({ key: 'preMedicareAnnualPremium', value: Math.round(health.healthcare.annualPremium) });
    }
  }
  return figures;
}
