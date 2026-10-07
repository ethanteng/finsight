"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarClock, ChevronRight, Waves } from 'lucide-react';
import type {
  CashFlowAdjustment,
  CashFlowItemTransaction,
  CashFlowRecurringItem,
  CashFlowReport,
  CashFlowTypicalPayee,
  ForecastAdjustmentKind,
} from '../../types/cash-flow';
import { sendCashFlowRequest } from '../../lib/cash-flow-api';
import { CADENCE_LABELS, accountNamesById, formatCalendarDate, formatMoney, roundToTotal } from '../../lib/cash-flow-format';

type Flow = 'income' | 'spending';

/** Items a list shows before "Show more". */
const LIST_LIMIT = 8;

/** What one button asks the server to change. */
interface AdjustmentRequest {
  kind: ForecastAdjustmentKind;
  flow: Flow;
  key: string;
}

/**
 * Moves an item between the columns. Its accessible name says which item, and
 * the arrow says which way it goes on a wide screen, where the columns sit side by side.
 */
function MoveButton({ label, item, toward, disabled, onClick }: {
  label: string;
  item: string;
  /** Which column it moves to; none for an undo in the list of changes. */
  toward?: 'out' | 'in';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${item}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#102319]/15 bg-white px-2.5 py-1 text-xs font-bold text-[#102319] transition hover:border-[#102319]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {toward === 'in' && <ArrowLeft size={12} className="hidden lg:inline" aria-hidden="true" />}
      {label}
      {toward === 'out' && <ArrowRight size={12} className="hidden lg:inline" aria-hidden="true" />}
    </button>
  );
}

/** An item's transactions: the latest at a glance, and every listed one on request. */
function Transactions({ items, count }: { items: readonly CashFlowItemTransaction[]; count: number }) {
  const [open, setOpen] = useState(false);
  const latest = items[0];
  if (!latest) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(shown => !shown)}
        className="inline-flex items-center gap-1 text-left text-xs font-semibold text-[#49725a] hover:text-[#102319]"
      >
        <ChevronRight size={12} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        {count === 1 ? '1 transaction' : `${count} transactions`} · latest {formatCalendarDate(latest.date)}: {formatMoney(latest.amount, true)}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l-2 border-[#102319]/10 pl-3">
          {items.map(item => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 text-[#5e6b63]">
                {formatCalendarDate(item.date)}
                {item.category ? ` · ${item.category}` : ''}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-[#102319]">{formatMoney(item.amount, true)}</span>
            </li>
          ))}
          {count > items.length && <li className="text-xs text-[#66736b]">Showing the latest {items.length} of {count}.</li>}
        </ul>
      )}
    </div>
  );
}

function ItemRow({ name, detail, category, marker, amount, action, transactions, transactionCount }: {
  name: string;
  detail?: string;
  /** Where the transactions are categorized; omitted when they are not. */
  category?: string | null;
  /** Says the user moved it, e.g. "kept by you". */
  marker?: string;
  amount?: string;
  action?: React.ReactNode;
  transactions?: readonly CashFlowItemTransaction[];
  transactionCount?: number;
}) {
  const describe = [detail, category].filter(Boolean).join(' · ');
  return (
    <li className="py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="line-clamp-2 break-words font-semibold text-[#102319]">{name}</span>
          {(describe || marker) && (
            <span className="text-xs text-[#66736b]">
              {describe}
              {describe && marker ? ' · ' : ''}
              {marker && <span className="font-semibold text-[#28704d]">{marker}</span>}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {amount && <span className="font-bold tabular-nums text-[#102319]">{amount}</span>}
          {action}
        </span>
      </div>
      {transactions && transactions.length > 0 && (
        <Transactions items={transactions} count={transactionCount ?? transactions.length} />
      )}
    </li>
  );
}

function ListButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-bold text-[#102319] underline">
      {children}
    </button>
  );
}

/**
 * A long list shows its first few items. "Show more" adds that many again and
 * "Show all" the rest; "Show fewer" goes back to the first few and "Hide all"
 * folds the list away.
 */
function CappedList<T>({ items, render, empty }: {
  items: readonly T[];
  render: (item: T) => React.ReactNode;
  empty?: string;
}) {
  const [count, setCount] = useState(LIST_LIMIT);
  if (items.length === 0) return empty ? <p className="py-1.5 text-sm text-[#66736b]">{empty}</p> : null;
  const total = items.length;
  const shown = Math.min(count, total);
  return (
    <>
      {shown > 0 && <ul className="divide-y divide-[#102319]/10">{items.slice(0, shown).map(render)}</ul>}
      {total > LIST_LIMIT && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {shown === 0 && <span className="text-xs text-[#66736b]">{total} hidden</span>}
          {shown < total && <ListButton onClick={() => setCount(Math.min(total, shown + LIST_LIMIT))}>Show {Math.min(LIST_LIMIT, total - shown)} more</ListButton>}
          {shown < total && <ListButton onClick={() => setCount(total)}>Show all {total}</ListButton>}
          {shown > LIST_LIMIT && <ListButton onClick={() => setCount(LIST_LIMIT)}>Show fewer</ListButton>}
          {shown > 0 && <ListButton onClick={() => setCount(0)}>Hide all</ListButton>}
        </div>
      )}
    </>
  );
}

function Group({ title, total, note, children }: {
  title: string;
  /** The group's monthly figure, beside its title. */
  total?: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 first:mt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h5 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#49725a]">{title}</h5>
        {total && <span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-[#102319]">{total}</span>}
      </div>
      {note && <p className="mt-1 text-xs leading-5 text-[#66736b]">{note}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** The colors that tie each half to its share of the bar above them. */
const HALF_COLORS = { repeating: '#102319', spread: '#8fb8a0', interest: '#c46a4a' } as const;
type HalfKind = keyof typeof HALF_COLORS;

/** How the side's month splits between its halves, as one bar. */
function SplitBar({ parts }: { parts: ReadonlyArray<{ kind: HalfKind; monthly: number }> }) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.monthly), 0);
  if (total <= 0) return null;
  return (
    <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-[#102319]/10" aria-hidden="true">
      {parts.filter(part => part.monthly > 0).map(part => (
        <span key={part.kind} style={{ width: `${(part.monthly / total) * 100}%`, backgroundColor: HALF_COLORS[part.kind] }} />
      ))}
    </div>
  );
}

/**
 * One of a side's two halves: what repeats on a schedule, or everything else
 * at the typical rate. Each says how it is projected and what it comes to.
 */
function Half({ kind, title, monthly, note, children }: {
  kind: HalfKind;
  title: string;
  /** Whole dollars, rounded with the other halves so they add up to the side. */
  monthly: number;
  note: string;
  children: React.ReactNode;
}) {
  const Icon = kind === 'repeating' ? CalendarClock : Waves;
  return (
    <div className="rounded-xl border border-[#102319]/10 bg-white/70 px-3 py-3 sm:px-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h6 className="flex items-center gap-1.5 text-sm font-bold text-[#102319]">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: HALF_COLORS[kind] }} aria-hidden="true" />
          <Icon size={14} className="shrink-0 text-[#49725a]" aria-hidden="true" />
          {title}
        </h6>
        <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[#102319]">
          {formatMoney(monthly)}<span className="font-normal text-[#66736b]"> a month</span>
        </span>
      </div>
      <p className="mt-0.5 text-xs leading-5 text-[#66736b]">{note}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** How each half of a side is projected, in the user's terms. */
const HALF_NOTES: Record<Flow, { repeating: string; spread: (days: number) => string }> = {
  income: {
    repeating: 'Paychecks and other income that arrive on a schedule. Each is projected on its own dates.',
    spread: days => `Income with no fixed schedule. Your last ${days} days, spread evenly across every day ahead.`,
  },
  spending: {
    repeating: 'Bills and subscriptions that come on a schedule. Each is projected on its own dates.',
    spread: days => `Spending with no fixed schedule, like groceries, shopping and gas. Your last ${days} days, spread evenly across every day ahead.`,
  },
};

function Column({ title, description, tone, children }: {
  title: string;
  description: string;
  tone: 'in' | 'out';
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${tone === 'in' ? 'border-[#28704d]/20 bg-[#c9f2df]/25' : 'border-[#102319]/10 bg-[#f3f2e9]/70'}`}>
      <h4 className="text-base font-bold text-[#102319]">{title}</h4>
      <p className="mt-0.5 text-xs leading-5 text-[#66736b]">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** A regular item's category: its latest transaction's, else the stream's own; none when it has none. */
function categoryOf(item: CashFlowRecurringItem): string | null {
  const category = item.transactions?.[0]?.category ?? item.category;
  return category && category !== 'Uncategorized' ? category : null;
}

/** What a saved change did, in the user's terms, for the full list of changes. */
function describeAdjustment(adjustment: CashFlowAdjustment): string {
  switch (adjustment.kind) {
    case 'exclude_payee':
      return adjustment.flow === 'income' ? 'Income left out of the forecast' : 'Spending left out of the forecast';
    case 'include_one_off':
      return adjustment.date !== null && adjustment.amount !== null
        ? `Counted in typical ${adjustment.flow}: ${formatMoney(adjustment.amount, true)} on ${formatCalendarDate(adjustment.date)}`
        : `Counted in typical ${adjustment.flow}`;
    case 'continue_stream':
      return 'Kept in the forecast after it stopped';
    case 'exclude_transfer':
      return adjustment.flow === 'income' ? 'Transfer in left out of your cash position' : 'Transfer out left out of your cash position';
  }
}

/**
 * What the forecast counts and what it leaves out, side by side. Every item
 * moves to the other column with its button; the change is saved and the
 * forecast reloads. Changes only affect the forecast, never the history.
 */
export default function ForecastBoard({ report, apiUrl, onChanged }: {
  report: CashFlowReport;
  apiUrl: string;
  /** Reload the report after the user changes what the forecast counts. */
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { baseline } = report;
  // Defaults keep a newer page from crashing if the report is from an older API.
  const adjustments = report.adjustments ?? [];
  const typicalPayees = report.typicalPayees ?? [];
  const basisDays = baseline.typicalBasisDays;

  // A monthly override from Finances replaces what that side learns from
  // transactions, so its items are not listed and a change to them would do nothing.
  const learned = (flow: Flow) => (flow === 'income' ? baseline.incomeSource : baseline.spendingSource) === 'transactions';
  // Leaving out spending still reshapes how a spending override is split
  // between cash and cards; nothing else reads what an overridden side learns.
  const cancelledByOverride = (adjustment: CashFlowAdjustment) => !learned(adjustment.flow)
    && (adjustment.kind === 'include_one_off' || adjustment.kind === 'continue_stream'
      || (adjustment.kind === 'exclude_payee' && adjustment.flow === 'income'));
  const overrideNote = (adjustment: CashFlowAdjustment) =>
    cancelledByOverride(adjustment) ? ` · no effect while your monthly ${adjustment.flow} from Finances is set` : '';

  const change = async (method: 'POST' | 'DELETE', path: string, body?: AdjustmentRequest) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await sendCashFlowRequest(apiUrl, path, method, body);
      // Undo is idempotent: a missing change just means the list is already right.
      if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data.error === 'string' ? data.error : 'We couldn’t change the forecast. Please try again.');
        return;
      }
      await onChanged();
    } catch {
      setError('We couldn’t change the forecast. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const adjust = (request: AdjustmentRequest) => change('POST', '/api/cash-flow/adjustments', request);
  const undo = (adjustment: CashFlowAdjustment) => change('DELETE', `/api/cash-flow/adjustments/${encodeURIComponent(adjustment.id)}`);
  // The report names the choice that keeps a stopped item, which may hold the
  // payee's earlier key; an older report does not, so fall back to the key.
  const kept = (item: CashFlowRecurringItem) => adjustments.find(adjustment => (item.continuedBy
    ? adjustment.id === item.continuedBy
    : adjustment.kind === 'continue_stream' && adjustment.flow === item.flow && adjustment.key === item.payeeKey));
  // Only a change that is what puts a transaction in the typical rate counts:
  // one whose one-off aged out, or whose payee now repeats, does nothing here.
  const countedBy = (payee: CashFlowTypicalPayee) => adjustments.find(adjustment =>
    adjustment.kind === 'include_one_off' && (payee.countedOneOffIds ?? []).includes(adjustment.key));

  // Where each regular item is expected, once there is more than one account it could be.
  const accountNames = accountNamesById(report);
  const inAccount = (accountId: string | undefined) => {
    const name = accountId ? accountNames.get(accountId) : undefined;
    return name ? ` · ${name}` : '';
  };

  const regularRow = (item: CashFlowRecurringItem) => {
    const keptBy = item.continuedByUser ? kept(item) : undefined;
    return (
      <ItemRow
        key={item.id}
        name={item.label}
        detail={`${CADENCE_LABELS[item.cadence]}${item.nextDate ? ` · next ${formatCalendarDate(item.nextDate)}` : ''}${inAccount(item.accountId)}`}
        category={categoryOf(item)}
        marker={item.continuedByUser ? 'kept by you' : undefined}
        amount={formatMoney(item.amount, true)}
        transactions={item.transactions}
        transactionCount={item.transactionCount}
        action={keptBy
          ? <MoveButton label="Stop counting" item={item.label} toward="out" disabled={busy} onClick={() => undo(keptBy)} />
          : <MoveButton label="Leave out" item={item.label} toward="out" disabled={busy} onClick={() => adjust({ kind: 'exclude_payee', flow: item.flow, key: item.payeeKey })} />}
      />
    );
  };
  const typicalRow = (payee: CashFlowTypicalPayee) => {
    const counted = countedBy(payee);
    return (
      <ItemRow
        key={`${payee.flow}:${payee.payeeKey}`}
        name={payee.label}
        category={payee.transactions?.[0]?.category}
        marker={counted ? 'counted by you' : undefined}
        amount={`${formatMoney(payee.monthlyAmount)}/mo`}
        transactions={payee.transactions}
        transactionCount={payee.transactionCount}
        action={counted
          ? <MoveButton label="Move back" item={payee.label} toward="out" disabled={busy} onClick={() => undo(counted)} />
          : <MoveButton label="Leave out" item={payee.label} toward="out" disabled={busy} onClick={() => adjust({ kind: 'exclude_payee', flow: payee.flow, key: payee.payeeKey })} />}
      />
    );
  };

  // A side's usual month, split into its two halves, plus the card interest
  // spending carries. The halves are rounded together, so the shown figures
  // add up to the side's total.
  const split = (flow: Flow) => {
    const regular = report.recurring.filter(item => item.flow === flow && item.status === 'active');
    const typical = typicalPayees.filter(payee => payee.flow === flow);
    const repeating = (flow === 'income' ? baseline.recurringMonthlyIncome : baseline.recurringMonthlySpending)
      // A report from before the field existed: the same items at their monthly rates.
      ?? regular.reduce((sum, item) => sum + item.monthlyAmount, 0);
    const spread = flow === 'income' ? baseline.typicalMonthlyIncome : baseline.typicalMonthlySpending;
    // A report from before the field existed still counts the interest in its
    // usual spending, as projected-interest sources; take it from there.
    const interest = flow === 'spending'
      ? baseline.cardInterestMonthly ?? (report.usualSpending?.categories ?? [])
        .flatMap(category => category.sources ?? [])
        .reduce((sum, source) => sum + (source.kind === 'projected_interest' ? source.monthly : 0), 0)
      : 0;
    const exact = [repeating, spread, interest];
    const total = Math.round(exact.reduce((sum, part) => sum + part, 0));
    const [repeatingShown, spreadShown, interestShown] = roundToTotal(exact, total);
    return { regular, typical, total, repeating: repeatingShown, spread: spreadShown, interest: interestShown };
  };

  const side = (flow: Flow) => {
    const override = flow === 'income' ? baseline.monthlyIncomeOverride : baseline.monthlyExpenseOverride;
    if (!learned(flow)) {
      return (
        <p className="py-1.5 text-sm text-[#5e6b63]">
          Your monthly {flow} of {formatMoney(override ?? 0)} from the Finances page is used instead.
        </p>
      );
    }
    const parts = split(flow);
    return (
      <>
        <SplitBar parts={[
          { kind: 'repeating', monthly: parts.repeating },
          { kind: 'spread', monthly: parts.spread },
          { kind: 'interest', monthly: parts.interest },
        ]}
        />
        <div className="space-y-2.5">
          <Half kind="repeating" title="Repeating" monthly={parts.repeating} note={HALF_NOTES[flow].repeating}>
            <CappedList items={parts.regular} render={regularRow} empty="Nothing repeats on a schedule yet." />
          </Half>
          <Half kind="spread" title="Everything else" monthly={parts.spread} note={HALF_NOTES[flow].spread(basisDays)}>
            <CappedList items={parts.typical} render={typicalRow} empty={`Nothing else in your last ${basisDays} days.`} />
          </Half>
          {parts.interest > 0 && (
            <div className="flex items-baseline justify-between gap-3 rounded-xl border border-dashed border-[#102319]/15 px-3.5 py-2.5 text-xs leading-5 text-[#66736b]">
              <span className="min-w-0">
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-[-1px]" style={{ backgroundColor: HALF_COLORS.interest }} aria-hidden="true" />
                <span className="font-bold text-[#102319]">Card interest</span>: projected from each card’s APR at your usual payment pace.
              </span>
              <span className="shrink-0 whitespace-nowrap font-bold tabular-nums text-[#102319]">{formatMoney(parts.interest)} a month</span>
            </div>
          )}
        </div>
      </>
    );
  };
  const sideTotal = (flow: Flow) => (learned(flow) ? `about ${formatMoney(split(flow).total)} a month` : undefined);

  // The Left out column: one-offs and stopped items on sides learned from
  // transactions, and what the user left out themselves.
  const thresholds = report.oneOffThresholds ?? null;
  const oneOffSides = (['spending', 'income'] as const).filter(learned);
  const oneOffs = report.oneOffs.filter(item => learned(item.flow));
  const stopped = report.recurring.filter(item => item.status === 'lapsed' && learned(item.flow));
  const leftOutByUser = adjustments.filter(adjustment => adjustment.kind === 'exclude_payee' || adjustment.kind === 'exclude_transfer');
  const thresholdText = thresholds && oneOffSides.length > 0
    ? oneOffSides
      .map(flow => `${formatMoney(thresholds[flow])} or more ${flow === 'income' ? 'received' : 'spent'}`)
      .join(', or ')
    : null;
  const transfers = report.position.available ? report.position.transfers : null;
  const showTransfers = transfers !== null && (transfers.recurring.length > 0 || Math.round(transfers.typicalMonthlyNet) !== 0);

  return (
    <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="forecast-board-heading">
      <h3 id="forecast-board-heading" className="text-lg font-semibold text-[#102319]">What the forecast counts</h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5e6b63]">
        Move anything in or out with its button, and the forecast updates. Changes only affect the forecast; past months
        stay as they happened. If something isn’t really income or spending, like a transfer to your own account, change its
        category in <Link href="/profile" className="font-semibold text-[#102319] underline">Accounts &amp; context</Link>{' '}
        instead, which corrects your history too.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-[#b84a3d]/25 bg-[#f8e8e3] px-3.5 py-2.5 text-sm text-[#8b3027]">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Column title="Counted in the forecast" description="Projected forward from your history." tone="in">
          <Group title="Money in" total={sideTotal('income')}>{side('income')}</Group>
          <Group title="Money out" total={sideTotal('spending')}>{side('spending')}</Group>
          {showTransfers && transfers && (
            <Group
              title="Transfers"
              note="Money moving to or from accounts that aren’t connected here, like investments. It changes your cash position, but isn’t income or spending."
            >
              <CappedList
                items={transfers.recurring}
                render={item => (
                  <ItemRow
                    key={item.id}
                    name={item.label}
                    detail={`${CADENCE_LABELS[item.cadence]}${item.nextDate ? ` · next ${formatCalendarDate(item.nextDate)}` : ''}${inAccount(item.accountId)}`}
                    amount={`${item.direction === 'in' ? '+' : '−'}${formatMoney(item.amount, true)}`}
                    transactions={item.transactions}
                    transactionCount={item.transactionCount}
                    action={(
                      <MoveButton
                        label="Leave out"
                        item={item.label}
                        toward="out"
                        disabled={busy}
                        onClick={() => adjust({ kind: 'exclude_transfer', flow: item.direction === 'in' ? 'income' : 'spending', key: item.payeeKey })}
                      />
                    )}
                  />
                )}
              />
              {Math.round(transfers.typicalMonthlyNet) !== 0 && (
                <p className="mt-1 text-xs leading-5 text-[#66736b]">
                  Plus about {formatMoney(Math.abs(transfers.typicalMonthlyNet))} a month
                  {transfers.typicalMonthlyNet < 0 ? ' out' : ' in'} in other transfers, spread evenly.
                </p>
              )}
            </Group>
          )}
        </Column>

        <Column title="Left out" description="Not projected. Move anything back in." tone="out">
          <Group
            title="One-offs"
            note={thresholdText
              ? `A large amount that stands out from everything else from its payee in your last ${basisDays} days: ${thresholdText}, and at least twice the rest from that payee. Amounts within ten days of each other, like a sum moved in pieces, count together. Counting one spreads it over those ${basisDays} days, as if amounts like it come that often.`
              : undefined}
          >
            <CappedList
              items={oneOffs}
              empty={thresholdText ? `None in your last ${basisDays} days.` : 'None yet.'}
              render={item => (
                <ItemRow
                  key={item.id}
                  name={item.label}
                  detail={formatCalendarDate(item.date)}
                  category={item.category}
                  amount={`${item.flow === 'income' ? '+' : ''}${formatMoney(item.amount, true)}`}
                  action={<MoveButton label="Count it" item={item.label} toward="in" disabled={busy} onClick={() => adjust({ kind: 'include_one_off', flow: item.flow, key: item.id })} />}
                />
              )}
            />
          </Group>

          <Group title="Stopped" note="Regular items that haven’t shown up lately. Keep counting one you know continues.">
            <CappedList
              items={stopped}
              empty="Nothing has stopped."
              render={item => (
                <ItemRow
                  key={item.id}
                  name={item.label}
                  detail={`${CADENCE_LABELS[item.cadence]} · last ${formatCalendarDate(item.lastDate)}${inAccount(item.accountId)}`}
                  category={categoryOf(item)}
                  amount={formatMoney(item.amount, true)}
                  transactions={item.transactions}
                  transactionCount={item.transactionCount}
                  action={<MoveButton label="Keep counting" item={item.label} toward="in" disabled={busy} onClick={() => adjust({ kind: 'continue_stream', flow: item.flow, key: item.payeeKey })} />}
                />
              )}
            />
          </Group>

          <Group title="Left out by you">
            <CappedList
              items={leftOutByUser}
              empty="Nothing yet. Use Leave out on anything you don’t want projected."
              render={adjustment => (
                <ItemRow
                  key={adjustment.id}
                  name={adjustment.label}
                  detail={`${adjustment.kind === 'exclude_transfer'
                    ? (adjustment.flow === 'income' ? 'Transfer in' : 'Transfer out')
                    : (adjustment.flow === 'income' ? 'Money in' : 'Money out')}${overrideNote(adjustment)}`}
                  category={adjustment.transactions?.[0]?.category}
                  transactions={adjustment.transactions}
                  transactionCount={adjustment.transactionCount}
                  action={<MoveButton label="Put back" item={adjustment.label} toward="in" disabled={busy} onClick={() => undo(adjustment)} />}
                />
              )}
            />
          </Group>
        </Column>
      </div>

      {adjustments.length > 0 && (
        <details className="mt-4 rounded-2xl border border-[#102319]/10 bg-white/50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-[#102319]">All your changes ({adjustments.length})</summary>
          <ul className="mt-2 divide-y divide-[#102319]/10">
            {adjustments.map(adjustment => (
              <ItemRow
                key={adjustment.id}
                name={adjustment.label}
                detail={`${describeAdjustment(adjustment)}${overrideNote(adjustment)}`}
                action={<MoveButton label="Undo" item={adjustment.label} disabled={busy} onClick={() => undo(adjustment)} />}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
