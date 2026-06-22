/**
 * Canonical Financial Snapshot Transformer
 *
 * Maps FinancialContextSnapshot to the spec's canonical format for LLM prompts:
 * { assets: { cash, brokerage, retirement }, liabilities: { mortgage }, income, expenses, age, retirement_goal_age }
 */

import { FinancialContextSnapshot } from './types';
import { extractAgeFromProfile, extractRetirementAgeFromProfile } from '../retirement-analytics/profile-age-extractor';
import { classifyAccount } from '../services/account-classifier';

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
      const classified = classifyAccount(acc);
      const balance = Math.max(0, classified.balance);
      if (classified.category === 'cash') {
        derivedCash += balance;
      } else if (classified.category === 'brokerage') {
        derivedBrokerage += balance;
      } else if (classified.category === 'retirement') {
        derivedRetirement += balance;
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
      const classified = classifyAccount(acc);

      // Cash accounts with negative balance (overdraft) — consistent across summary builders
      if (classified.isCash && classified.balance < 0) {
        liabilities['overdraft'] = (liabilities['overdraft'] || 0) + Math.abs(classified.balance);
        continue;
      }

      if (!classified.isDebt) continue;
      const balance = Math.abs(classified.balance);
      if (balance <= 0) continue;

      if (classified.category === 'mortgage') {
        mortgage += balance;
      } else if (classified.category === 'credit') {
        liabilities['credit'] = (liabilities['credit'] || 0) + balance;
      } else {
        const key = classified.liabilityKey || 'loan';
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
