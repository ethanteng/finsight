/**
 * Canonical Financial Snapshot Transformer
 *
 * Maps FinancialContextSnapshot to the spec's canonical format for LLM prompts:
 * { assets: { cash, brokerage, retirement }, liabilities: { mortgage }, income, expenses, age, retirement_goal_age }
 */

import { FinancialContextSnapshot } from './types';
import { extractAgeFromProfile, extractRetirementAgeFromProfile } from '../retirement-analytics/profile-age-extractor';

export interface CanonicalFinancialSnapshot {
  assets: {
    cash: number;
    brokerage: number;
    retirement: number;
  };
  liabilities: {
    mortgage: number;
    [key: string]: number;
  };
  income: number;
  expenses: number;
  age: number | null;
  /** Target retirement age; defaults to 65 when not specified in profile. */
  retirement_goal_age: number;
}

/** Standard default when user has not specified a retirement goal age (e.g. in profile). */
const DEFAULT_RETIREMENT_GOAL_AGE = 65;

const RETIREMENT_SUBTYPES = ['401k', 'ira', 'roth', 'roth ira', 'traditional ira', 'pension', 'annuity', 'hsa', '529'];
const BROKERAGE_SUBTYPES = ['brokerage'];
const CASH_TYPES = ['depository'];
const CASH_SUBTYPES = ['checking', 'savings', 'cd', 'money market', 'prepaid'];
const MORTGAGE_SUBTYPES = ['mortgage', 'home equity'];

/** Extract numeric balance from account (handles both { current, available } and raw number) */
function getAccountBalance(acc: any): number {
  const b = acc?.balance;
  if (typeof b === 'number' && !Number.isNaN(b)) return b;
  if (b && typeof b === 'object') return b.current ?? b.available ?? 0;
  return 0;
}

/**
 * Transform FinancialContextSnapshot to canonical format for LLM financial reasoning.
 */
export function toCanonicalSnapshot(snapshot: FinancialContextSnapshot): CanonicalFinancialSnapshot {
  const overview = snapshot.financialSummary?.financialOverview;
  const profile = snapshot.userProfile || '';

  // Assets: derive from accounts if available, else from overview
  let cash = overview?.totalCash ?? 0;
  let brokerage = 0;
  let retirement = overview?.totalInvestments ?? 0;

  if (snapshot.accounts && snapshot.accounts.length > 0) {
    let derivedCash = 0;
    let derivedBrokerage = 0;
    let derivedRetirement = 0;

    for (const acc of snapshot.accounts) {
      const subtype = (acc.subtype || acc.type || '').toLowerCase();
      const type = (acc.type || '').toLowerCase();
      const balance = getAccountBalance(acc);

      if (CASH_TYPES.includes(type) || CASH_SUBTYPES.includes(subtype)) {
        derivedCash += Math.max(0, balance);
      } else if (BROKERAGE_SUBTYPES.includes(subtype)) {
        derivedBrokerage += Math.max(0, balance);
      } else if (RETIREMENT_SUBTYPES.some(r => subtype.includes(r))) {
        derivedRetirement += Math.max(0, balance);
      } else if (type === 'investment') {
        // Investment without specific subtype - treat as brokerage by default
        derivedBrokerage += Math.max(0, balance);
      }
    }

    if (derivedCash > 0 || derivedBrokerage > 0 || derivedRetirement > 0) {
      cash = derivedCash;
      brokerage = derivedBrokerage;
      retirement = derivedRetirement;
      // If we only have totalInvestments from overview but no account breakdown, keep overview for investments
      if (derivedBrokerage === 0 && derivedRetirement === 0 && (overview?.totalInvestments ?? 0) > 0) {
        retirement = overview!.totalInvestments;
      }
    }
  }

  // Liabilities: derive mortgage, overdraft, credit, loans from accounts if available
  let mortgage = 0;
  const liabilities: Record<string, number> = {};

  if (snapshot.accounts && snapshot.accounts.length > 0) {
    for (const acc of snapshot.accounts) {
      const subtype = (acc.subtype || acc.type || '').toLowerCase();
      const type = (acc.type || '').toLowerCase();
      const rawBalance = getAccountBalance(acc);

      // Cash accounts with negative balance (overdraft) — consistent with FinancialSummaryService
      if ((CASH_TYPES.includes(type) || CASH_SUBTYPES.includes(subtype)) && rawBalance < 0) {
        liabilities['overdraft'] = (liabilities['overdraft'] || 0) + Math.abs(rawBalance);
        continue;
      }

      const balance = Math.abs(rawBalance);
      if (balance <= 0) continue;

      if (MORTGAGE_SUBTYPES.some(m => subtype.includes(m))) {
        mortgage += balance;
      } else if (type === 'credit') {
        liabilities['credit'] = (liabilities['credit'] || 0) + balance;
      } else if (type === 'loan' || ['student', 'personal', 'auto'].some(s => subtype.includes(s))) {
        const key = subtype || 'loan';
        liabilities[key] = (liabilities[key] || 0) + balance;
      }
    }
  }

  if (mortgage === 0 && (overview?.totalDebt ?? 0) > 0 && Object.keys(liabilities).length === 0) {
    // No account breakdown - use totalDebt as mortgage as best guess when we have debt
    mortgage = overview!.totalDebt;
  }

  const finalLiabilities: CanonicalFinancialSnapshot['liabilities'] = { ...liabilities, mortgage };

  // Income and expenses from structured numeric data (never parse strings)
  const monthlyIncome = snapshot.averageMonthlyIncome ?? null;
  const monthlyExpense = snapshot.averageMonthlyExpense ?? null;
  const income = monthlyIncome != null ? monthlyIncome * 12 : 0;
  const expenses = monthlyExpense != null ? monthlyExpense * 12 : 0;

  // Age from profile
  const age = extractAgeFromProfile(profile);
  const extractedRetirementAge = extractRetirementAgeFromProfile(profile);
  const retirement_goal_age = extractedRetirementAge ?? DEFAULT_RETIREMENT_GOAL_AGE;

  return {
    assets: { cash, brokerage, retirement },
    liabilities: finalLiabilities,
    income,
    expenses,
    age,
    retirement_goal_age
  };
}

/**
 * Format canonical snapshot as JSON string for LLM prompt inclusion.
 */
export function formatCanonicalSnapshotForPrompt(snapshot: CanonicalFinancialSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
