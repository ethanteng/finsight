/**
 * What a retirement plan needs to count income tax: how the money is held,
 * how the household files, and what the state takes.
 *
 * The engine (`retirement-analytics/engine/taxes.ts`, `retirement-cash-plan.ts`)
 * applies the rules; this module decides the inputs, each from the best source
 * there is, and says where it came from so every answer can disclose it:
 *
 * - Accounts. Linked holdings are split by their account's own type (a 401(k)
 *   is pre-tax, a Roth IRA is Roth, a brokerage account is taxable). Money
 *   whose account does not say -- a balance entered by hand, an account typed
 *   "other", a plan with nothing linked -- takes the split the user stated in
 *   this decision, then the one saved in Your numbers, and otherwise is
 *   treated as pre-tax: the common case for retirement savings, and the most
 *   heavily taxed, so the plan errs toward paying more tax, never less. Cost
 *   basis comes from the linked holdings; where it is unknown, every dollar
 *   drawn from a taxable account counts as a gain.
 * - Filing. Married couples file jointly; an unmarried couple files two
 *   single returns, and so does a couple whose marriage nobody has stated,
 *   since it is never assumed. Whoever outlives the other files single.
 * - State. A rate the user stated, then Your numbers; none in the nine states
 *   with no income tax on wages and retirement income; otherwise unknown, and
 *   then not counted, disclosed, and asked.
 */

import type { RetirementHealthcare, RetirementPeople, RetirementTaxes } from '../retirement-analytics/types';
import type { Marriage, ResolvedPartner } from './household';
import { savedNumber, type StatedFigures } from './stated-figures';

export type TaxTreatment = 'taxable' | 'pretax' | 'roth';

/** Account subtypes by how withdrawals are taxed (Plaid's names; SnapTrade and Public map onto them). */
const PRETAX_SUBTYPES = new Set([
  '401a', '401k', '403b', '457b', 'ira', 'traditional ira', 'rollover ira', 'sep ira', 'simple ira', 'sarsep',
  'keogh', 'pension', 'profit sharing plan', 'thrift savings plan', 'retirement', 'traditional 401k',
  'fixed annuity', 'variable annuity', 'other annuity', 'annuity',
  // An HSA is tax-free only for medical costs; drawn for ordinary spending it
  // is taxed as income, like a traditional IRA. The plan does not tell the
  // two apart, so it counts the heavier.
  'hsa',
  // Canadian registered plans are tax-deferred the same way.
  'rrsp', 'rrif', 'lira', 'lif', 'lrif', 'lrsp', 'prif', 'rlif', 'qshr',
]);
const ROTH_SUBTYPES = new Set([
  'roth', 'roth ira', 'roth 401k', 'roth 403b', 'roth 457b',
  // Tax-free on the way out, as a Roth is: the Canadian and UK equivalents.
  'tfsa', 'isa', 'cash isa', 'non-taxable brokerage account',
]);
const TAXABLE_SUBTYPES = new Set([
  'brokerage', 'cash management', 'mutual fund', 'stock plan', 'trust', 'ugma', 'utma', 'crypto exchange',
  'non-custodial wallet', 'managed', 'treasury', 'bond', 'gic', 'individual', 'joint',
  // Education accounts used for anything else pay tax on their gains.
  '529', 'education savings account', 'resp',
]);

/**
 * How withdrawals from an account are taxed, from its subtype, or from its
 * name when the subtype is generic. Undefined when neither says.
 */
export function accountTaxTreatment(account: { subtype?: string | null; type?: string | null; name?: string | null }): TaxTreatment | undefined {
  const subtype = String(account.subtype ?? '').trim().toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ');
  const name = String(account.name ?? '').toLowerCase();
  if (ROTH_SUBTYPES.has(subtype)) return 'roth';
  // A Roth filed under a retirement subtype ("ira", as SnapTrade accounts
  // synced before Roth had its own were) is still a Roth.
  if (PRETAX_SUBTYPES.has(subtype)) return /\broth\b/.test(name) ? 'roth' : 'pretax';
  if (TAXABLE_SUBTYPES.has(subtype)) return 'taxable';
  // A generic subtype ("investment", "other", none) can still be named for
  // what it is: "Roth IRA", "Rollover IRA", "Individual brokerage".
  if (/\broth\b/.test(name)) return 'roth';
  if (/\b(?:401\s*\(?k\)?|403\s*\(?b\)?|457|ira|tsp|thrift savings|pension|sep|simple|hsa|health savings)\b/.test(name)) {
    return 'pretax';
  }
  if (/\b(?:brokerage|individual|joint|taxable)\b/.test(name)) return 'taxable';
  return undefined;
}

/** Linked holdings by how their accounts are taxed, in dollars. */
export interface AccountTaxMix {
  taxable: number;
  pretax: number;
  roth: number;
  /** Value whose account does not say how it is taxed. */
  unknown: number;
  /** Cost basis of the taxable holdings whose basis is known. */
  taxableBasis: number;
  /** Taxable value whose cost basis is unknown, counted as all gain. */
  taxableWithoutBasis: number;
}

interface HoldingLike {
  account_id?: unknown;
  institution_value?: unknown;
  cost_basis?: unknown;
}

interface AccountLike {
  account_id?: unknown;
  id?: unknown;
  subtype?: string | null;
  type?: string | null;
  name?: string | null;
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The holdings' value split by their accounts' tax treatment; null when there is no value to split. */
export function linkedAccountTaxMix(holdings: readonly HoldingLike[], accounts: readonly AccountLike[]): AccountTaxMix | null {
  const byId = new Map<string, AccountLike>();
  for (const account of accounts) {
    for (const id of [account.account_id, account.id]) {
      if (typeof id === 'string' && id) byId.set(id, account);
    }
  }
  const mix: AccountTaxMix = { taxable: 0, pretax: 0, roth: 0, unknown: 0, taxableBasis: 0, taxableWithoutBasis: 0 };
  for (const holding of holdings) {
    const value = finitePositive(holding.institution_value);
    if (value === undefined) continue;
    const account = typeof holding.account_id === 'string' ? byId.get(holding.account_id) : undefined;
    const treatment = account ? accountTaxTreatment(account) : undefined;
    if (!treatment) {
      mix.unknown += value;
      continue;
    }
    mix[treatment] += value;
    if (treatment === 'taxable') {
      const basis = typeof holding.cost_basis === 'number' && Number.isFinite(holding.cost_basis) && holding.cost_basis >= 0
        ? holding.cost_basis
        : undefined;
      if (basis === undefined) mix.taxableWithoutBasis += value;
      else mix.taxableBasis += Math.min(basis, value);
    }
  }
  const total = mix.taxable + mix.pretax + mix.roth + mix.unknown;
  return total > 0 ? mix : null;
}

/** How the user said their savings are held, in this decision: dollars or percentage points. */
export interface StatedAccountSplit {
  pretaxAmount?: number;
  rothAmount?: number;
  taxableAmount?: number;
  pretaxPercent?: number;
  rothPercent?: number;
  taxablePercent?: number;
}

export type AccountMixOrigin = 'linked' | 'stated' | 'saved' | 'assumed';

export interface AccountMixResolution {
  shares: RetirementTaxes['accounts'];
  taxableBasisShare: number;
  /** Where the split came from; `linked` may have had its untyped part filled from a stated or saved split. */
  origin: AccountMixOrigin;
  /** For an untyped part of linked holdings: where its split came from. */
  untypedOrigin?: Exclude<AccountMixOrigin, 'linked'>;
  savedAt?: string;
  /** Share of the plan counted as pre-tax because nothing said how it is held. */
  assumedPretaxShare: number;
  /** Whether any taxable money was counted as all gain for want of a cost basis. */
  basisUnknown: boolean;
}

type Shares = RetirementTaxes['accounts'];

/**
 * Shares from what the user said, with anything they left unsaid counted as
 * pre-tax. Amounts are read against the plan's total when there is one;
 * percentages against 100. Undefined when they said nothing usable.
 */
function statedShares(split: StatedAccountSplit | undefined, total: number | undefined): { shares: Shares; unsaid: number } | undefined {
  if (!split) return undefined;
  const fromParts = (parts: Partial<Shares>, whole: number | undefined, remainderIsStated: boolean) => {
    const said = (parts.taxable ?? 0) + (parts.pretax ?? 0) + (parts.roth ?? 0);
    if (!(said > 0)) return undefined;
    // Amounts that come to more than the plan's total describe the split, not
    // a second portfolio: read them as proportions of what was said.
    const base = whole !== undefined && whole > said ? whole : said;
    const unsaid = remainderIsStated ? 0 : (base - said) / base;
    const remainder = (base - said) / base;
    return {
      shares: {
        taxable: (parts.taxable ?? 0) / base,
        pretax: (parts.pretax ?? 0) / base + remainder,
        roth: (parts.roth ?? 0) / base,
      },
      unsaid,
    };
  };
  const amounts = fromParts(
    { taxable: split.taxableAmount, pretax: split.pretaxAmount, roth: split.rothAmount },
    total,
    // Dollar amounts against a larger total leave an unplaced share assumed pre-tax.
    false
  );
  if (amounts) return amounts;
  // Percents match the form and Your numbers: Roth and taxable are what the
  // user placed, and the rest is pre-tax by statement, not assumption.
  return fromParts(
    { taxable: split.taxablePercent, pretax: split.pretaxPercent, roth: split.rothPercent },
    100,
    true
  );
}

function savedShares(statedFigures: StatedFigures | undefined): { shares: Shares; unsaid: number; savedAt: string } | undefined {
  const roth = savedNumber(statedFigures, 'rothSavingsPercent');
  const taxable = savedNumber(statedFigures, 'taxableSavingsPercent');
  if (!roth && !taxable) return undefined;
  const said = (roth?.value ?? 0) + (taxable?.value ?? 0);
  const base = Math.max(100, said);
  const savedAt = [roth?.savedAt, taxable?.savedAt].filter((date): date is string => Boolean(date)).sort().pop()!;
  // Pre-tax is what the saved split leaves, a statement rather than an assumption.
  return {
    shares: { taxable: (taxable?.value ?? 0) / base, roth: (roth?.value ?? 0) / base, pretax: (base - said) / base },
    unsaid: 0,
    savedAt,
  };
}

/**
 * How the plan's money is held. Linked holdings by their accounts' types,
 * with any untyped part split as the user said, then as saved, then counted as
 * pre-tax; with nothing linked, the same order for the whole plan.
 */
export function resolveAccountMix(args: {
  linked?: AccountTaxMix | null;
  stated?: StatedAccountSplit;
  statedFigures?: StatedFigures;
  /** The plan's invested total, for stated amounts; the linked total when holdings are linked. */
  total?: number;
}): AccountMixResolution {
  const linkedTotal = args.linked
    ? args.linked.taxable + args.linked.pretax + args.linked.roth + args.linked.unknown
    : 0;
  const stated = statedShares(args.stated, linkedTotal > 0 ? linkedTotal : args.total);
  const saved = savedShares(args.statedFigures);
  // A partial stated dollar split (unsaid > 0) still outranks a blank, but
  // fills what was not placed from Your numbers rather than wiping a complete
  // saved split for an assumed all-pre-tax remainder.
  let fill = stated;
  if (stated && stated.unsaid > 0 && saved) {
    const u = stated.unsaid;
    fill = {
      shares: {
        taxable: stated.shares.taxable + u * saved.shares.taxable,
        pretax: stated.shares.pretax - u + u * saved.shares.pretax,
        roth: stated.shares.roth + u * saved.shares.roth,
      },
      unsaid: 0,
    };
  } else if (!stated) {
    fill = saved;
  }
  const fillOrigin: Exclude<AccountMixOrigin, 'linked'> = stated ? 'stated' : saved ? 'saved' : 'assumed';
  const fillShares: Shares = fill?.shares ?? { taxable: 0, pretax: 1, roth: 0 };
  const savedAt = (!stated || stated.unsaid > 0) ? saved?.savedAt : undefined;

  if (args.linked && linkedTotal > 0) {
    const mix = args.linked;
    const typed = mix.taxable + mix.pretax + mix.roth;
    if (typed > 0) {
      const untyped = mix.unknown / linkedTotal;
      const taxable = mix.taxable / linkedTotal + untyped * fillShares.taxable;
      // Untyped taxable money has no basis on record.
      const taxableDollars = mix.taxable + mix.unknown * fillShares.taxable;
      return {
        shares: {
          taxable,
          pretax: mix.pretax / linkedTotal + untyped * fillShares.pretax,
          roth: mix.roth / linkedTotal + untyped * fillShares.roth,
        },
        taxableBasisShare: taxableDollars > 0 ? Math.min(1, mix.taxableBasis / taxableDollars) : 0,
        origin: 'linked',
        ...(untyped > 0 && { untypedOrigin: fillOrigin }),
        ...(untyped > 0 && savedAt && { savedAt }),
        assumedPretaxShare: untyped * (fill ? fill.unsaid : 1),
        basisUnknown: mix.taxableWithoutBasis > 0 || (untyped > 0 && fillShares.taxable > 0),
      };
    }
  }
  return {
    shares: fillShares,
    taxableBasisShare: 0,
    origin: fillOrigin,
    ...(savedAt && { savedAt }),
    assumedPretaxShare: fill ? fill.unsaid : 1,
    basisUnknown: fillShares.taxable > 0,
  };
}

export type FilingOrigin = 'no_partner' | 'married' | 'not_married' | 'marriage_unknown';

/** How the household files while both are alive. */
export function filingFor(partner: Pick<ResolvedPartner, 'married'> | null | undefined): {
  filing: RetirementTaxes['filing'];
  origin: FilingOrigin;
  married?: Marriage;
} {
  if (!partner) return { filing: 'single', origin: 'no_partner' };
  if (partner.married?.value === true) return { filing: 'joint', origin: 'married', married: partner.married };
  if (partner.married?.value === false) return { filing: 'separate_singles', origin: 'not_married', married: partner.married };
  return { filing: 'separate_singles', origin: 'marriage_unknown' };
}

/** The states with no income tax on wages or retirement income, by postal code and name. */
const NO_INCOME_TAX_STATES: Readonly<Record<string, string>> = {
  AK: 'Alaska',
  FL: 'Florida',
  NV: 'Nevada',
  NH: 'New Hampshire',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  WA: 'Washington',
  WY: 'Wyoming',
};

/** The no-income-tax state a remembered location names, or undefined. */
export function noIncomeTaxState(stateOrProvince: string | null | undefined, country?: string | null): string | undefined {
  const where = String(stateOrProvince ?? '').trim();
  if (!where) return undefined;
  const countryText = String(country ?? '').trim().toLowerCase();
  if (countryText && !/^(?:us|usa|u\.s\.a?\.?|united states(?: of america)?|america)$/.test(countryText)) return undefined;
  const code = where.replace(/\./g, '').toUpperCase();
  if (NO_INCOME_TAX_STATES[code]) return NO_INCOME_TAX_STATES[code];
  const name = Object.values(NO_INCOME_TAX_STATES).find((state) => state.toLowerCase() === where.toLowerCase());
  return name;
}

export type StateTaxResolution =
  | { kind: 'rate'; rate: number; origin: 'stated' | 'saved'; savedAt?: string }
  /** A state with no income tax: nothing to count. */
  | { kind: 'none'; state: string }
  /** Nobody has said: not counted, and the answer asks. */
  | { kind: 'unknown' };

/** The highest state rate a stated figure can be: above it, the figure is a misreading. */
export const MAXIMUM_STATE_TAX_PERCENT = 15;

/**
 * State income tax on retirement income: what the user stated in this
 * decision, then Your numbers, then none for a remembered state with no
 * income tax; otherwise unknown.
 */
export function resolveStateTax(args: {
  statedPercent?: number;
  statedFigures?: StatedFigures;
  stateOrProvince?: string | null;
  country?: string | null;
}): StateTaxResolution {
  const usable = (percent: number | undefined) =>
    percent !== undefined && Number.isFinite(percent) && percent >= 0 && percent <= MAXIMUM_STATE_TAX_PERCENT;
  if (usable(args.statedPercent)) return { kind: 'rate', rate: args.statedPercent! / 100, origin: 'stated' };
  const saved = savedNumber(args.statedFigures, 'stateIncomeTaxPercent');
  if (saved && usable(saved.value)) return { kind: 'rate', rate: saved.value / 100, origin: 'saved', savedAt: saved.savedAt };
  const state = noIncomeTaxState(args.stateOrProvince, args.country);
  if (state) return { kind: 'none', state };
  return { kind: 'unknown' };
}

/** Everything a calculator resolves about taxes, with the engine's input. */
export interface RetirementTaxResolution {
  taxes: RetirementTaxes;
  accounts: AccountMixResolution;
  filing: ReturnType<typeof filingFor>;
  state: StateTaxResolution;
}

export function resolveRetirementTaxes(args: {
  linked?: AccountTaxMix | null;
  stated?: StatedAccountSplit;
  statedStatePercent?: number;
  statedFigures?: StatedFigures;
  total?: number;
  partner?: Pick<ResolvedPartner, 'married'> | null;
  stateOrProvince?: string | null;
  country?: string | null;
}): RetirementTaxResolution {
  const accounts = resolveAccountMix({
    linked: args.linked,
    stated: args.stated,
    statedFigures: args.statedFigures,
    total: args.total,
  });
  const filing = filingFor(args.partner);
  const state = resolveStateTax({
    statedPercent: args.statedStatePercent,
    statedFigures: args.statedFigures,
    stateOrProvince: args.stateOrProvince,
    country: args.country,
  });
  return {
    taxes: {
      accounts: accounts.shares,
      taxableBasisShare: accounts.taxableBasisShare,
      filing: filing.filing,
      stateRate: state.kind === 'rate' ? state.rate : 0,
    },
    accounts,
    filing,
    state,
  };
}

/** The split as Your numbers keeps it, whole percents, when the user stated it in this decision. */
export function savableAccountSplit(resolution: AccountMixResolution | undefined): { rothSavingsPercent: number; taxableSavingsPercent: number } | undefined {
  // A partial dollar split filled from Your numbers keeps origin "stated" and
  // zero assumedPretaxShare, but savedAt marks the hybrid — do not offer those
  // blended percents as if the user placed the whole mix.
  if (
    !resolution ||
    resolution.origin !== 'stated' ||
    resolution.assumedPretaxShare > 0 ||
    resolution.savedAt
  ) {
    return undefined;
  }
  return {
    rothSavingsPercent: Math.round(resolution.shares.roth * 100),
    taxableSavingsPercent: Math.round(resolution.shares.taxable * 100),
  };
}

/** The engine inputs taxes and premiums add to a run, as a stored run keeps them. */
export interface TaxAndPremiumInputs {
  taxes?: RetirementTaxes;
  healthcare?: RetirementHealthcare;
  people?: RetirementPeople;
}

/**
 * Whether a stored run counted the same taxes and premiums, field by field: a
 * jsonb column hands keys back in its own order, so comparing serialized
 * objects would miss every match.
 */
export function sameTaxAndPremiumInputs(stored: Record<string, unknown>, current: TaxAndPremiumInputs): boolean {
  const close = (left: unknown, right: unknown) =>
    (left === undefined || left === null) && (right === undefined || right === null)
      ? true
      : typeof left === 'number' && typeof right === 'number' && Math.abs(left - right) < 1e-9;
  const taxes = stored.taxes as Partial<RetirementTaxes> | undefined;
  const healthcare = stored.healthcare as Partial<RetirementHealthcare> | undefined;
  const people = stored.people as Partial<RetirementPeople> | undefined;
  if (Boolean(taxes) !== Boolean(current.taxes)) return false;
  if (taxes && current.taxes) {
    const accounts = taxes.accounts as Partial<RetirementTaxes['accounts']> | undefined;
    if (
      taxes.filing !== current.taxes.filing ||
      !close(taxes.stateRate, current.taxes.stateRate) ||
      !close(taxes.taxableBasisShare, current.taxes.taxableBasisShare) ||
      !close(accounts?.taxable, current.taxes.accounts.taxable) ||
      !close(accounts?.pretax, current.taxes.accounts.pretax) ||
      !close(accounts?.roth, current.taxes.accounts.roth)
    ) {
      return false;
    }
  }
  if (Boolean(healthcare) !== Boolean(current.healthcare)) return false;
  if (healthcare && current.healthcare && (
    healthcare.coverage !== current.healthcare.coverage ||
    !close(healthcare.annualPremium, current.healthcare.annualPremium)
  )) {
    return false;
  }
  return close(people?.userPlanThroughAge, current.people?.userPlanThroughAge) &&
    close(people?.partner?.age, current.people?.partner?.age) &&
    close(people?.partner?.planEndsAtUserAge, current.people?.partner?.planEndsAtUserAge);
}
