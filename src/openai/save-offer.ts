/**
 * "Use these next time?": the figures an answer was built on that the user
 * stated in this decision and has not saved, offered for Your numbers.
 *
 * Nothing is saved without the click. A decision holds both the user's plan
 * and their what-ifs, and the application cannot always tell them apart: a
 * comparison's changed values are never offered, but a first question can be
 * a what-if on its own ("what if I retired at 50?"). The user sees each figure
 * and decides.
 *
 * The plan goes to Your numbers. The invested balance goes to a manual
 * account, which is where Ask Linc reads balances from, and only when nothing
 * investment-like is linked or entered: saving it beside a linked brokerage
 * would count the same money twice.
 */

import { balanceBasis } from './linked-data';
import type { FinancialContextSnapshot } from './types';
import {
  acceptedFigureValue,
  STATED_FIGURE_KEYS,
  type StatedFigureKey,
} from '../services/stated-figures';

export type SaveOfferKey = StatedFigureKey | 'investedBalance';

/** A figure a calculator ran on, as the user stated it, under the key it would be saved as. */
export interface SavableFigure {
  key: SaveOfferKey;
  value: number | string;
}

export interface SaveOfferItem {
  key: SaveOfferKey;
  label: string;
  value: number | string;
  /** The value as the user reads it: "$80,000 a year", "60", "Growth". */
  display: string;
}

export interface SaveOffer {
  calculatorId: string;
  items: SaveOfferItem[];
}

const LABELS: Record<SaveOfferKey, string> = {
  retirementAge: 'Retirement age',
  annualRetirementSpending: 'Spending in retirement',
  annualContribution: 'Saving each year until you retire',
  retirementIncome: 'Pension or other income in retirement',
  socialSecurityAnnual: 'Social Security',
  socialSecurityStartAge: 'Social Security starts at',
  planThroughAge: 'Plan through age',
  allocation: 'Preset mix',
  investedBalance: 'Invested today',
};

const MIX_LABELS: Record<string, string> = { conservative: 'Conservative', balanced: 'Balanced', growth: 'Growth' };

function display(key: SaveOfferKey, value: number | string): string {
  if (typeof value === 'string') return MIX_LABELS[value] ?? value;
  const dollars = `$${Math.round(value).toLocaleString('en-US')}`;
  if (key === 'investedBalance') return dollars;
  if (key === 'retirementAge' || key === 'socialSecurityStartAge' || key === 'planThroughAge') return String(value);
  return `${dollars} a year`;
}

/**
 * The offer for one completed calculation, or null when there is nothing new
 * to save. Each figure must be one Your numbers accepts and differ from what
 * is already saved; the balance needs nothing investment-like on record.
 */
export function buildSaveOffer(
  calculatorId: string,
  figures: readonly SavableFigure[],
  snapshot: Pick<FinancialContextSnapshot, 'statedFigures' | 'linkedData'>
): SaveOffer | null {
  const items: SaveOfferItem[] = [];
  const seen = new Set<SaveOfferKey>();
  for (const { key, value } of figures) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (key === 'investedBalance') {
      // Unknown coverage (no record) is treated as covered: offering a second
      // copy of a balance is worse than not offering it.
      const nothingOnRecord = snapshot.linkedData !== undefined && balanceBasis(snapshot.linkedData, 'investments') === null;
      if (!nothingOnRecord || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
      items.push({ key, label: LABELS[key], value: Math.round(value), display: display(key, value) });
      continue;
    }
    if (!(STATED_FIGURE_KEYS as readonly string[]).includes(key)) continue;
    const accepted = acceptedFigureValue(key, value);
    // A stated zero (no pension, nothing saved yearly) is what a blank already
    // means, so it is not worth a line of its own.
    if (accepted === undefined || accepted === 0 || snapshot.statedFigures?.[key]?.value === accepted) continue;
    items.push({ key, label: LABELS[key], value: accepted, display: display(key, accepted) });
  }
  // One order whatever the calculator: the plan, then the balance.
  const order = Object.keys(LABELS);
  items.sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key));
  return items.length > 0 ? { calculatorId, items } : null;
}
