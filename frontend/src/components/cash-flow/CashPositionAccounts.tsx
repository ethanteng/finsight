"use client";

import { useState } from 'react';
import type { CashFlowReport, CashPositionHappenedItem, CashPositionItem, CashPositionItemRef } from '../../types/cash-flow';
import { sendCashFlowRequest } from '../../lib/cash-flow-api';
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
  planned_transfer: 'Planned transfer',
  planned_transfer_in: 'Planned transfer',
  planned_transfer_out: 'Planned transfer',
};

/**
 * Where a planned transfer goes, from the accounts in view: "from Checking to
 * Savings" when both are, otherwise just the account on the other side.
 */
function transferRoute(item: Pick<CashPositionItem, 'kind' | 'transfer'>, names: Map<string, string>): string {
  if (!item.transfer) return '';
  const name = (id: string | null) => (id && names.get(id)) || 'another account';
  if (item.kind === 'planned_transfer_out') return ` to ${name(item.transfer.toAccountId)}`;
  if (item.kind === 'planned_transfer_in') return ` from ${name(item.transfer.fromAccountId)}`;
  return ` from ${name(item.transfer.fromAccountId)} to ${name(item.transfer.toAccountId)}`;
}

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

/** An item's amount: a move between two accounts in view has no sign, since it leaves their total as it was. */
function ItemAmount({ item }: { item: Pick<CashPositionItem, 'kind' | 'transfer' | 'amount'> }) {
  return item.kind === 'planned_transfer' && item.transfer
    ? <p className="font-bold tabular-nums text-[#102319]">{formatMoney(item.transfer.amount)}</p>
    : <p className={`font-bold tabular-nums ${item.amount < 0 ? 'text-[#9b4137]' : 'text-[#28704d]'}`}>{formatSignedMoney(item.amount)}</p>;
}

const linkButtonClass = 'text-xs font-bold text-[#28704d] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The control that marks an upcoming item as already happened. It sits under
 * every listed item, so it is muted and always underlined: green bold text
 * under each row read as a status -- every item looked already marked.
 */
const markButtonClass = 'mt-0.5 text-xs font-semibold text-[#66736b] underline decoration-[#66736b]/40 underline-offset-4 hover:text-[#28704d] hover:decoration-current disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The dated amounts coming up in the accounts the position covers, with the
 * balance after each day. Any of them can be marked as already happened -- a
 * paycheck the balance already has while the bank shows it pending, a bill
 * paid early -- which skips it: the balance has it, so the forecast doesn't
 * count it again. Marked items are listed above the rest, each with an undo.
 */
export function UpcomingItems({ report, apiUrl, onChanged }: {
  report: Pick<CashFlowReport, 'position'>;
  apiUrl: string;
  onChanged: () => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = report.position.upcoming;
  const happened = report.position.happened ?? [];
  if (items.length === 0 && happened.length === 0) return null;
  const shown = expanded ? items : items.slice(0, UPCOMING_SHOWN);
  const note = spreadNote(report.position.spreadPerDay);
  const names = new Map(report.position.accounts.map(account => [account.id, cashAccountName(account)]));

  const change = async (method: 'POST' | 'DELETE', path: string, body?: CashPositionItemRef) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await sendCashFlowRequest(apiUrl, path, method, body);
      // Undo is idempotent: a mark that is already gone means the list is already right.
      if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data.error === 'string' ? data.error : 'We couldn’t update the forecast. Please try again.');
        return;
      }
      await onChanged();
    } catch {
      setError('We couldn’t update the forecast. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const markHappened = (ref: CashPositionItemRef) => change('POST', '/api/cash-flow/happened', ref);
  const undo = (item: CashPositionHappenedItem) => change('DELETE', `/api/cash-flow/happened/${encodeURIComponent(item.markId)}`);

  return (
    <div className="mt-5 rounded-2xl border border-[#102319]/10 bg-white/50 p-4">
      <h4 className="text-sm font-bold text-[#102319]">Coming up in the next month</h4>
      <p className="mt-1 text-xs leading-5 text-[#66736b]">
        Paychecks, bills, transfers, card payments and planned events, with the balance at the end of each day.
        {note && ` ${note}`}
      </p>
      {items.some(item => item.ref) && (
        <p className="mt-1 text-xs leading-5 text-[#66736b]">
          Already in your balance, like a paycheck your bank still shows as pending? Mark it as already happened and
          the forecast skips it, so it isn’t counted twice.
        </p>
      )}
      {happened.length > 0 && (
        <section aria-labelledby="cash-flow-happened" className="mt-3 rounded-xl border border-[#28704d]/15 bg-[#f1f7ec] px-3 py-2.5">
          <h5 id="cash-flow-happened" className="text-xs font-bold text-[#102319]">Already happened</h5>
          <p className="mt-0.5 text-xs leading-5 text-[#66736b]">
            You marked these as already in your balance, so the forecast skips them and doesn’t count them again.
          </p>
          <ul className="mt-1 divide-y divide-[#102319]/10">
            {happened.map(item => (
              <li key={item.markId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#102319]">{item.label}</p>
                  <p className="text-xs text-[#66736b]">
                    Expected {formatCalendarDate(item.ref.date)} · {KIND_WORDS[item.kind]}{transferRoute(item, names)} · skipped
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <ItemAmount item={item} />
                  <button type="button" disabled={busy} onClick={() => undo(item)} className={linkButtonClass}
                    aria-label={`Undo: ${item.label} already happened`}>
                    Undo
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="mt-2 divide-y divide-[#102319]/10">
        {shown.map((item, index) => (
          <li key={`${item.date}-${item.kind}-${item.label}-${index}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#102319]">{item.label}</p>
              <p className="text-xs text-[#66736b]">
                {formatCalendarDate(item.date)} · {KIND_WORDS[item.kind]}{transferRoute(item, names)}
              </p>
              {item.ref && (
                <button type="button" disabled={busy} onClick={() => markHappened(item.ref!)} className={markButtonClass}
                  aria-label={`Mark ${item.label} on ${formatCalendarDate(item.date)} as already happened`}>
                  Mark as already happened
                </button>
              )}
            </div>
            <div className="shrink-0 text-right">
              <ItemAmount item={item} />
              <p className={`text-xs tabular-nums ${item.balanceAfter < 0 ? 'font-bold text-[#9b4137]' : 'text-[#66736b]'}`}>
                {formatMoney(item.balanceAfter)} after
              </p>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs font-semibold text-[#9b4137]" role="alert">{error}</p>}
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
