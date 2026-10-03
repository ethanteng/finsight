"use client";

import { useState } from 'react';
import type { CashFlowReport, CashPositionItem } from '../../types/cash-flow';
import {
  cashAccountName,
  formatCalendarDate,
  formatMoney,
  formatSignedMoney,
} from '../../lib/cash-flow-format';

const chipClass = (on: boolean) =>
  `min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2 ${
    on ? 'border-[#102319] bg-[#102319] text-white' : 'border-[#102319]/15 bg-[#fffdf5] text-[#5e6b63] hover:border-[#102319]/30 hover:text-[#102319]'
  }`;

/**
 * Which cash accounts the position covers: all of them, or any of them. From
 * "All accounts", choosing an account shows just that one; further choices add
 * to it, and clearing the last one returns to all.
 *
 * `selectedIds` is the choice in the browser (empty = all). Pressed state uses
 * that rather than the last report, so a click looks selected before refetch.
 */
export function PositionAccountPicker({ report, selectedIds, onChange }: {
  report: Pick<CashFlowReport, 'position'>;
  selectedIds: string[];
  onChange: (accountIds: string[]) => void;
}) {
  const { accounts } = report.position;
  if (accounts.length < 2) return null;
  const known = new Set(accounts.map(account => account.id));
  const chosen = selectedIds.filter(id => known.has(id));
  const all = chosen.length === 0;
  const toggle = (accountId: string) => {
    if (all) {
      onChange([accountId]);
      return;
    }
    const next = chosen.includes(accountId) ? chosen.filter(id => id !== accountId) : [...chosen, accountId];
    onChange(next.length === accounts.length ? [] : next);
  };
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Accounts">
      <button type="button" aria-pressed={all} onClick={() => onChange([])} className={chipClass(all)}>
        All accounts
      </button>
      {accounts.map(account => {
        const on = !all && chosen.includes(account.id);
        return (
          <button key={account.id} type="button" aria-pressed={on} onClick={() => toggle(account.id)} className={chipClass(on)}>
            {cashAccountName(account)}
          </button>
        );
      })}
    </div>
  );
}

const KIND_WORDS: Record<CashPositionItem['kind'], string> = {
  income: 'Regular income',
  bill: 'Regular bill',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  card_payment: 'Card payment',
  planned_income: 'Planned income',
  planned_expense: 'Planned expense',
};

/** How many coming-up items show before "Show all". */
const UPCOMING_SHOWN = 8;

/**
 * What moves the balance between the listed items, so the list adds up:
 * "Everything else isn’t listed: it’s spread evenly across the days, about
 * $85 out and $12 in each day." Null when nothing is spread.
 */
export function spreadNote(spread: CashFlowReport['position']['spreadPerDay']): string | null {
  // A report from before the figure was published.
  if (spread === undefined) return 'Everyday spending isn’t listed: it’s spread across the days.';
  if (spread === null) return null;
  const parts = [
    Math.round(spread.out) > 0 ? `${formatMoney(spread.out)} out` : null,
    Math.round(spread.in) > 0 ? `${formatMoney(spread.in)} in` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `Everything else isn’t listed: it’s spread evenly across the days, about ${parts.join(' and ')} each day.`;
}

/** The dated amounts coming up in the accounts the position covers, with the balance after each day. */
export function UpcomingItems({ report }: { report: Pick<CashFlowReport, 'position'> }) {
  const [expanded, setExpanded] = useState(false);
  const items = report.position.upcoming;
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, UPCOMING_SHOWN);
  const note = spreadNote(report.position.spreadPerDay);
  return (
    <div className="mt-5 rounded-2xl border border-[#102319]/10 bg-white/50 p-4">
      <h4 className="text-sm font-bold text-[#102319]">Coming up in the next month</h4>
      <p className="mt-1 text-xs leading-5 text-[#66736b]">
        Paychecks, bills, transfers, card payments and planned events, with the balance at the end of each day.
        {note && ` ${note}`}
      </p>
      <ul className="mt-2 divide-y divide-[#102319]/10">
        {shown.map((item, index) => (
          <li key={`${item.date}-${item.kind}-${item.label}-${index}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#102319]">{item.label}</p>
              <p className="text-xs text-[#66736b]">{formatCalendarDate(item.date)} · {KIND_WORDS[item.kind]}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`font-bold tabular-nums ${item.amount < 0 ? 'text-[#9b4137]' : 'text-[#28704d]'}`}>{formatSignedMoney(item.amount)}</p>
              <p className={`text-xs tabular-nums ${item.balanceAfter < 0 ? 'font-bold text-[#9b4137]' : 'text-[#66736b]'}`}>
                {formatMoney(item.balanceAfter)} after
              </p>
            </div>
          </li>
        ))}
      </ul>
      {items.length > UPCOMING_SHOWN && (
        <button
          type="button"
          onClick={() => setExpanded(current => !current)}
          className="mt-2 text-sm font-bold text-[#28704d] underline-offset-4 hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
