import { getPrismaClient } from '../prisma-client';
import { counterpartyKey, legacyCounterpartyKey } from '../cash-flow/ledger';
import { cashFlowDirection, resolveCanonicalTransactionType } from './canonical-transaction-adapter';
import { canonicalTypeForCategory } from './transaction-category-taxonomy';

/**
 * User-chosen transaction categories.
 *
 * The category a user picks has to survive two very different reads:
 *  - the snapshot the profile UI fetches, which is a stored JSON blob and is only
 *    rebuilt by a full revision (tens of seconds), and
 *  - every later revision, which re-reads provider payloads and would otherwise
 *    hand back Plaid's category again.
 *
 * So a save does both: it patches the stored snapshot in place for an immediate
 * read-back, and `applyCategoryOverrides` re-applies the override during ingestion
 * so the choice sticks across recomputes.
 *
 * The in-place patch is display-only — it cannot recompute `transactionsSummary`, whose
 * totals are produced from the ingested data at revision time. Callers therefore schedule
 * a background revision so the cash-flow rollups catch up with the edit.
 *
 * A category applied to a payee's other transactions is also saved as a rule for that
 * payee. Ingestion gives each new matching transaction its own override from the rule,
 * so from then on it is like any other override: the user can change or restore it on
 * its own, and removing the rule leaves it be.
 */

/** Same resolution order the snapshot builder uses, so ids line up on both sides. */
export function resolveProviderTransactionId(transaction: any): string | null {
  const id =
    transaction?.transaction_id ||
    transaction?.investment_transaction_id ||
    transaction?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Applies category + classification fields the same way ingestion does.
 *
 * Restoring is not symmetric with overriding: the provider's own classification cannot be
 * reconstructed from its category, so a restore re-derives what it can and clears what it
 * cannot, rather than leaving the user's values stamped on a row whose category has gone
 * back to the provider's — a chip reading "Expense" over a transfer category. Inside a
 * stored snapshot these fields are display-only (cash-flow totals are computed from
 * ingested data at revision time), and the revision scheduled alongside the restore
 * rebuilds them from the provider.
 */
export function stampCategoryFieldsOnTransaction(
  transaction: any,
  category: string[],
  source: 'user' | 'provider'
): void {
  transaction.category = [...category];
  if (source === 'user') {
    transaction.category_source = 'user';
  } else {
    delete transaction.category_source;
  }

  const primary = category[0];
  if (primary) {
    transaction.personal_finance_category = {
      primary,
      detailed: category[1] || '',
    };
  } else if (source === 'provider') {
    delete transaction.personal_finance_category;
  }

  const canonicalType = canonicalTypeForCategory(category);
  if (canonicalType) {
    // All three are consulted ahead of the category, in this order, so a stale value
    // left in any of them would outrank the user's choice.
    transaction.aiCategory = canonicalType;
    transaction.canonicalTransactionType = canonicalType;
    transaction.transaction_type = canonicalType;
  } else if (source === 'provider') {
    // An override on a transaction the provider never categorized: show no type rather
    // than the one the user's since-removed choice implied.
    delete transaction.aiCategory;
    delete transaction.canonicalTransactionType;
    delete transaction.transaction_type;
  }
}

export function normalizeCategory(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(entry => entry !== '' && entry !== '0');
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .split(',')
      .map(entry => entry.trim())
      .filter(entry => entry !== '' && entry !== '0');
  }
  return [];
}

export async function getCategoryOverrides(userId: string): Promise<Map<string, string[]>> {
  const rows = await getPrismaClient().transactionCategoryOverride.findMany({
    where: { userId },
    select: { transactionId: true, category: true },
  });
  return new Map(rows.map(row => [row.transactionId, row.category]));
}

/**
 * Stamps user categories onto in-memory transactions. `category_source` lets the UI
 * label the chip as the user's own choice rather than the provider's.
 *
 * Rewriting `category` alone would only change the chip: cash-flow classification reads
 * `aiCategory`/`transaction_type`/`personal_finance_category`, so a transfer corrected to
 * groceries would still be excluded from spending. The provider's classification fields
 * are therefore restated from the user's choice, which is safe here because this runs on
 * the ingestion copy — after persistence, and rebuilt from the provider on every run.
 *
 * A selection with no deterministic cash-flow meaning leaves the existing classification
 * alone rather than blanking it, which would push the transaction into `unclassified`.
 */
export function applyOverridesToTransactions(
  transactions: any[] | undefined,
  overrides: Map<string, string[]>
): number {
  if (!Array.isArray(transactions) || overrides.size === 0) return 0;
  let applied = 0;
  for (const transaction of transactions) {
    const id = resolveProviderTransactionId(transaction);
    if (!id) continue;
    const category = overrides.get(id);
    if (!category) continue;
    stampCategoryFieldsOnTransaction(transaction, category, 'user');
    applied += 1;
  }
  return applied;
}

/** A payee and the way its transactions move money: what a category rule is for. */
export interface CategoryRuleSubject {
  counterpartyKey: string;
  /** The key the payee had before reference words were dropped whole; set only where it differs. */
  legacyCounterpartyKey?: string;
  direction: 'in' | 'out';
  investment: boolean;
}

export interface CategoryRule {
  id: string;
  counterpartyKey: string;
  direction: 'in' | 'out';
  investment: boolean;
  label: string;
  category: string[];
}

/**
 * What a rule would be for, keyed the way `matchingTransactions` matches: null when
 * the payee has no name to match on or which way the money moves can't be told.
 */
export function categoryRuleSubject(transaction: any): CategoryRuleSubject | null {
  const key = counterpartyKey(transaction?.merchant_name, transaction?.name);
  const direction = moneyDirection(transaction);
  if (!key || !direction) return null;
  const legacy = legacyCounterpartyKey(transaction?.merchant_name, transaction?.name);
  return { counterpartyKey: key, ...(legacy && { legacyCounterpartyKey: legacy }), direction, investment: isInvestmentActivity(transaction) };
}

/** Whether a rule is for this payee: by its key, or by the key it had when the rule was made. */
export function ruleCovers(rule: Pick<CategoryRule, 'counterpartyKey' | 'direction' | 'investment'>, subject: CategoryRuleSubject): boolean {
  return rule.direction === subject.direction
    && rule.investment === subject.investment
    && (rule.counterpartyKey === subject.counterpartyKey || rule.counterpartyKey === subject.legacyCounterpartyKey);
}

function toCategoryRule(row: { id: string; counterpartyKey: string; direction: string; investment: boolean; label: string; category: string[] }): CategoryRule {
  return { ...row, direction: row.direction === 'in' ? 'in' : 'out' };
}

export async function getCategoryRules(userId: string): Promise<CategoryRule[]> {
  const rows = await getPrismaClient().transactionCategoryRule.findMany({
    where: { userId },
    select: { id: true, counterpartyKey: true, direction: true, investment: true, label: true, category: true },
  });
  return rows.map(toCategoryRule);
}

/** The rule for a transaction's payee, if the user made one. */
export async function findCategoryRule(userId: string, transaction: any): Promise<CategoryRule | null> {
  const subject = categoryRuleSubject(transaction);
  if (!subject) return null;
  return (await getCategoryRules(userId)).find(rule => ruleCovers(rule, subject)) ?? null;
}

/**
 * The overrides rules give transactions that have none: each one the payee's rule
 * covers, with the provider category it had as its restore point.
 */
export function overridesFromRules(
  transactions: readonly any[],
  overrides: ReadonlyMap<string, string[]>,
  rules: readonly CategoryRule[]
): Array<{ transactionId: string; category: string[]; originalCategory: string[] }> {
  if (rules.length === 0) return [];
  const created: Array<{ transactionId: string; category: string[]; originalCategory: string[] }> = [];
  for (const transaction of transactions) {
    const id = resolveProviderTransactionId(transaction);
    if (!id || overrides.has(id)) continue;
    const subject = categoryRuleSubject(transaction);
    const rule = subject && rules.find(item => ruleCovers(item, subject));
    if (!rule) continue;
    created.push({ transactionId: id, category: [...rule.category], originalCategory: providerCategoryFromTransaction(transaction) });
  }
  return created;
}

/**
 * Re-applies stored overrides to freshly ingested provider data, first giving each
 * new transaction a rule covers an override of its own.
 */
export async function applyCategoryOverrides(userId: string, data: any): Promise<void> {
  const overrides = await getCategoryOverrides(userId);
  // Rules only add overrides: one that cannot be read or saved must not cost the
  // user the categories already saved, so the stored ones are applied regardless.
  try {
    const transactions = [
      ...(Array.isArray(data?.bankingTransactions) ? data.bankingTransactions : []),
      ...(Array.isArray(data?.investments?.transactions) ? data.investments.transactions : []),
    ];
    const fromRules = overridesFromRules(transactions, overrides, await getCategoryRules(userId));
    if (fromRules.length > 0) {
      // A concurrent save may have given one an override already; that one stands.
      await getPrismaClient().transactionCategoryOverride.createMany({
        data: fromRules.map(override => ({ userId, ...override })),
        skipDuplicates: true,
      });
      for (const override of fromRules) overrides.set(override.transactionId, override.category);
    }
  } catch (error) {
    console.warn('Failed to apply transaction category rules (non-fatal):', error);
  }
  if (overrides.size === 0) return;
  applyOverridesToTransactions(data?.bankingTransactions, overrides);
  applyOverridesToTransactions(data?.investments?.transactions, overrides);
}

/**
 * Patches transactions inside the stored snapshot so the next read reflects the
 * change without waiting for a revision. Scoped by `computedAt` so a revision that
 * lands mid-write wins instead of being silently overwritten with stale rows.
 *
 * Returns true when the snapshot was updated.
 */
export async function patchSnapshotTransactionCategories(
  userId: string,
  transactionIds: ReadonlySet<string>,
  category: string[],
  source: 'user' | 'provider'
): Promise<boolean> {
  const prisma = getPrismaClient();
  const snapshot = await prisma.financialSummarySnapshot.findUnique({
    where: { userId },
    select: { computedAt: true, transactions: true },
  });
  if (!snapshot || !Array.isArray(snapshot.transactions)) return false;

  let found = false;
  const transactions = (snapshot.transactions as any[]).map(transaction => {
    const id = resolveProviderTransactionId(transaction);
    if (!id || !transactionIds.has(id)) return transaction;
    found = true;
    const patched = { ...transaction };
    stampCategoryFieldsOnTransaction(patched, category, source);
    return patched;
  });
  if (!found) return false;

  const update = await prisma.financialSummarySnapshot.updateMany({
    where: { userId, computedAt: snapshot.computedAt },
    data: { transactions: transactions as any },
  });
  return update.count > 0;
}

export async function patchSnapshotTransactionCategory(
  userId: string,
  transactionId: string,
  category: string[],
  source: 'user' | 'provider'
): Promise<boolean> {
  return patchSnapshotTransactionCategories(userId, new Set([transactionId]), category, source);
}

export async function findSnapshotTransaction(
  userId: string,
  transactionId: string
): Promise<any | null> {
  const snapshot = await getPrismaClient().financialSummarySnapshot.findUnique({
    where: { userId },
    select: { transactions: true },
  });
  if (!snapshot || !Array.isArray(snapshot.transactions)) return null;

  return (
    (snapshot.transactions as any[]).find(
      transaction => resolveProviderTransactionId(transaction) === transactionId
    ) ?? null
  );
}

/**
 * Provider category on a snapshot row. Skips rows already stamped with a user override
 * so a retried save does not treat the user's choice as the restore point.
 */
export function providerCategoryFromTransaction(transaction: any): string[] {
  if (!transaction || transaction.category_source === 'user') return [];
  return normalizeCategory(transaction.category);
}

/**
 * Provider category currently on the transaction, used as the restore point when the
 * user later clears their override. Reads the snapshot rather than the Transaction
 * table because the snapshot is what the UI showed them.
 */
export async function findSnapshotTransactionCategory(
  userId: string,
  transactionId: string
): Promise<string[] | null> {
  const match = await findSnapshotTransaction(userId, transactionId);
  if (!match) return null;
  return providerCategoryFromTransaction(match);
}

/**
 * Which way a transaction moves the user's cash, read from its cash-flow type
 * rather than its amount: a card account stores purchases and refunds alike as
 * positive, the opposite of a bank account, so the sign says nothing on its own.
 * Null when the type has no direction or can't be told.
 */
export function moneyDirection(transaction: any): 'in' | 'out' | null {
  const type = resolveCanonicalTransactionType(transaction);
  return type ? cashFlowDirection(type) : null;
}

/** Investment activity, from any provider: SnapTrade rows carry a plain `transaction_id`. */
function isInvestmentActivity(transaction: any): boolean {
  return Boolean(
    transaction?.investment_transaction_id
      || transaction?.isInvestmentTransaction
      || transaction?.snapTradeData
      || transaction?.source === 'snaptrade'
  );
}

/**
 * The other transactions a category edit can be applied to along with this one:
 * the same payee, keyed the way the cash-flow forecast groups a payee's
 * transactions, with money moving the same way, and the same kind of activity
 * (banking or investment). Direction matters because one payee can be both: an
 * edit to outgoing Venmo payments should not recategorize money friends sent,
 * and a merchant's refunds keep their own category. A transaction whose
 * direction can't be told matches nothing, rather than risk mixing the two.
 *
 * Transactions without a provider id cannot carry an override and are skipped,
 * as is everything when the payee has no name to match on.
 */
export function matchingTransactions(transactions: readonly any[], target: any): any[] {
  const key = counterpartyKey(target?.merchant_name, target?.name);
  const direction = moneyDirection(target);
  if (!key || !direction) return [];
  const targetId = resolveProviderTransactionId(target);
  const investment = isInvestmentActivity(target);
  return transactions.filter(transaction => {
    const id = resolveProviderTransactionId(transaction);
    return id !== null
      && id !== targetId
      && isInvestmentActivity(transaction) === investment
      && moneyDirection(transaction) === direction
      && counterpartyKey(transaction?.merchant_name, transaction?.name) === key;
  });
}

/** A snapshot transaction and the others a category edit can be applied to with it. */
export async function findMatchingSnapshotTransactions(
  userId: string,
  transactionId: string
): Promise<{ target: any; matches: any[] } | null> {
  const snapshot = await getPrismaClient().financialSummarySnapshot.findUnique({
    where: { userId },
    select: { transactions: true },
  });
  if (!snapshot || !Array.isArray(snapshot.transactions)) return null;
  const transactions = snapshot.transactions as any[];
  const target = transactions.find(transaction => resolveProviderTransactionId(transaction) === transactionId);
  if (!target) return null;
  return { target, matches: matchingTransactions(transactions, target) };
}
