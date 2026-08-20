/**
 * Investment value a holdings-based consumer cannot model.
 *
 * The canonical snapshot values an investment account at the greater of the
 * balance its institution reports and the market value of its itemized
 * holdings (see `canonical-financial-snapshot.ts`). Consumers that model a
 * portfolio position by position -- retirement analysis above all -- can only
 * see the itemized part. The difference is real money with no known asset
 * class: a 401(k) whose plan administrator does not itemize every position, or
 * a manually-added account carrying a balance and no holdings at all.
 *
 * Such value cannot be modeled without inventing a return assumption for it,
 * so the canonical rule for unclassified data applies -- report it explicitly
 * and leave it out rather than guess (docs/FINANCIAL_TRUTH_CONTRACT.md). This
 * module measures what is being left out so the exclusion can be stated as a
 * deliberate, quantified choice instead of silently understating a projection.
 */

/** Why one account contributes value no holdings-based model can see. */
export interface UnmodeledInvestmentReason {
  accountId: string;
  /** Account name when known, so the exclusion can be described to its owner. */
  label: string;
  amount: number;
  kind: 'partial-holdings' | 'no-holdings';
}

export interface UnmodeledInvestmentValue {
  /** Canonical total investments, the figure net worth is built from. */
  totalInvestments: number;
  /** Value the itemized holdings carry -- what a position-level model sees. */
  modeledValue: number;
  /** totalInvestments - modeledValue: real value with no modellable composition. */
  unmodeledValue: number;
  /**
   * Share of canonical investments a position-level model can see, 0-1.
   *
   * Dollar-weighted on purpose. Holdings-count completeness answers "do the
   * positions we received carry metadata", which stays high while a fifth of
   * the money is missing entirely.
   */
  valueCoverage: number;
  /** Largest contributors first. May be empty when the cause cannot be attributed. */
  reasons: UnmodeledInvestmentReason[];
}

interface CoverageAccount {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  balance?: number | null;
}

interface CoverageGap {
  accountId?: string | null;
  unexplainedValue?: number | null;
}

/**
 * Below a dollar, a difference is rounding or pricing skew between two feeds
 * read at different moments, not value anyone is missing.
 */
const MATERIAL_UNMODELED_VALUE = 1;

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function holdingsValueByAccount(
  holdings: readonly any[],
  reportingCurrency: string
): { total: number; byAccount: Map<string, number> } {
  const byAccount = new Map<string, number>();
  let total = 0;
  for (const holding of holdings) {
    // Match the canonical portfolio's own currency rule: a holding priced in
    // another currency is not part of a reporting-currency total.
    const currency = String(holding?.iso_currency_code || '').toUpperCase();
    if (currency !== reportingCurrency) continue;
    const value = finite(holding?.institution_value);
    if (value === null) continue;
    total += value;
    const accountId = typeof holding?.account_id === 'string' ? holding.account_id : '';
    if (accountId) byAccount.set(accountId, (byAccount.get(accountId) || 0) + value);
  }
  return { total, byAccount };
}

/**
 * Measure the investment value a position-level model cannot represent.
 *
 * Returns null when the holdings explain the canonical total, which is the
 * ordinary case and needs no caveat.
 */
export function summarizeUnmodeledInvestmentValue(input: {
  totalInvestments: unknown;
  holdings: readonly any[];
  accounts?: readonly CoverageAccount[];
  /** Per-account residuals recorded by the canonical portfolio builder. */
  coverageGaps?: readonly CoverageGap[];
  reportingCurrency?: string;
}): UnmodeledInvestmentValue | null {
  const totalInvestments = finite(input.totalInvestments);
  if (totalInvestments === null || totalInvestments <= 0) return null;

  const reportingCurrency = (input.reportingCurrency || 'USD').toUpperCase();
  const { total: modeledValue, byAccount } = holdingsValueByAccount(
    input.holdings || [],
    reportingCurrency
  );
  const unmodeledValue = totalInvestments - modeledValue;
  if (unmodeledValue < MATERIAL_UNMODELED_VALUE) return null;

  const accounts = input.accounts || [];
  const nameById = new Map<string, string>();
  for (const account of accounts) {
    const id = typeof account?.id === 'string' ? account.id : '';
    const name = typeof account?.name === 'string' ? account.name.trim() : '';
    if (id && name) nameById.set(id, name);
  }

  const reasons: UnmodeledInvestmentReason[] = [];
  const attributed = new Set<string>();

  // Accounts the provider itemized only part of.
  for (const gap of input.coverageGaps || []) {
    const accountId = typeof gap?.accountId === 'string' ? gap.accountId : '';
    const amount = finite(gap?.unexplainedValue);
    if (!accountId || amount === null || amount < MATERIAL_UNMODELED_VALUE) continue;
    attributed.add(accountId);
    reasons.push({
      accountId,
      label: nameById.get(accountId) || accountId,
      amount,
      kind: 'partial-holdings',
    });
  }

  // Investment accounts with a balance and no itemized positions at all --
  // manual entries, and provider accounts whose holdings never synced.
  for (const account of accounts) {
    const id = typeof account?.id === 'string' ? account.id : '';
    if (!id || attributed.has(id)) continue;
    if (String(account?.type || '').toLowerCase() !== 'investment') continue;
    if ((byAccount.get(id) || 0) > 0) continue;
    const balance = finite(account?.balance);
    if (balance === null || balance < MATERIAL_UNMODELED_VALUE) continue;
    attributed.add(id);
    reasons.push({
      accountId: id,
      label: nameById.get(id) || id,
      amount: balance,
      kind: 'no-holdings',
    });
  }

  reasons.sort((left, right) => right.amount - left.amount);

  return {
    totalInvestments,
    modeledValue,
    unmodeledValue,
    valueCoverage: modeledValue / totalInvestments,
    reasons,
  };
}

/**
 * Stable opening of the exclusion note, so a cached analysis carrying an older
 * copy can be recognized and replaced rather than stated twice.
 */
export const UNMODELED_VALUE_NOTE_PREFIX = 'This projection deliberately excludes ';

function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/**
 * One sentence stating what a projection leaves out and why.
 *
 * Written for the account holder rather than for a log: it names the amount
 * first, attributes it to specific accounts, gives the reason, and says which
 * direction the results are therefore wrong in. A reader who stops after this
 * sentence should still know not to read the projection as a point estimate.
 */
export function describeUnmodeledInvestmentValue(
  summary: UnmodeledInvestmentValue | null | undefined
): string | null {
  if (!summary || summary.unmodeledValue < MATERIAL_UNMODELED_VALUE) return null;

  const share = Math.round((1 - summary.valueCoverage) * 100);
  const parts = summary.reasons.slice(0, 3).map(reason =>
    reason.kind === 'partial-holdings'
      ? `${money(reason.amount)} of ${reason.label} is not itemized by the provider`
      : `${money(reason.amount)} in ${reason.label} has no holdings detail`
  );
  const attribution = parts.length > 0 ? ` (${parts.join('; ')})` : '';
  const remainder = summary.reasons.length > 3
    ? ` and ${summary.reasons.length - 3} other account${summary.reasons.length - 3 === 1 ? '' : 's'}`
    : '';

  return (
    `${UNMODELED_VALUE_NOTE_PREFIX}${money(summary.unmodeledValue)} of your investments` +
    `${attribution}${remainder}, about ${share}% of the total. ` +
    'Their asset mix is unknown, and modeling them would mean assuming a return they may not earn, ' +
    `so the projection runs on the ${money(summary.modeledValue)} that can be modeled position by position. ` +
    'Portfolio value, years of expenses, depletion horizon, and historical survival share are therefore ' +
    'floors — they understate what the full portfolio would support. Withdrawal rates move the other way: ' +
    'they are overstated relative to the full portfolio, so read them as ceilings on the true rate.'
  );
}
