"use client";

import { Fragment, createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, CalendarClock, ChevronRight, CreditCard, Waves,
} from 'lucide-react';
import type {
  CashFlowAdjustment,
  CashFlowItemTransaction,
  CashFlowItemTransactions,
  CashFlowRecurringItem,
  CashFlowReport,
  CashFlowTypicalCategory,
  ForecastAdjustmentKind,
} from '../../types/cash-flow';
import { sendCashFlowRequest } from '../../lib/cash-flow-api';
import {
  CADENCE_LABELS,
  SPREAD_CHOICES,
  accountNamesById,
  formatCalendarDate,
  formatMoney,
  roundToTotal,
  spreadLabel,
} from '../../lib/cash-flow-format';
import TransactionList, { CategoryButton, type TransactionChoices } from './TransactionList';

type Flow = 'income' | 'spending';

/** Items a list shows before "Show more". */
const LIST_LIMIT = 8;

/** What one button asks the server to change. */
interface AdjustmentRequest {
  kind: ForecastAdjustmentKind;
  flow: Flow;
  key: string;
  /** For spread_payee: how many months each amount is spread over. */
  spreadMonths?: number;
}

/** What every list of transactions on the board needs to load more and save a category. */
const BoardContext = createContext<{ apiUrl: string; onChanged: () => Promise<void> | void }>({
  apiUrl: '',
  onChanged: () => undefined,
});

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

/** The transactions an item lists, and what each one may add below its line. */
interface TransactionsSpec extends CashFlowItemTransactions {
  /** Which way the amounts move money; for a transfer, `income` is money in. */
  flow: Flow;
  /** Show each one's payee: one payee's transactions need none. */
  withLabels?: boolean;
  renderExtra?: (transaction: CashFlowItemTransaction) => React.ReactNode;
  renderChoices?: (transaction: CashFlowItemTransaction) => TransactionChoices | null;
}

/** An item's transactions: the latest at a glance, and the list on request. */
function Transactions({ spec }: { spec: TransactionsSpec }) {
  const [open, setOpen] = useState(false);
  const { apiUrl, onChanged } = useContext(BoardContext);
  const latest = spec.transactions[0];
  if (!latest) return null;
  const count = spec.transactionCount;
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
        <TransactionList
          transactions={spec.transactions}
          count={count}
          transactionsRef={spec.transactionsRef}
          flow={spec.flow}
          apiUrl={apiUrl}
          withLabels={Boolean(spec.withLabels)}
          onChanged={onChanged}
          renderExtra={spec.renderExtra}
          renderChoices={spec.renderChoices}
        />
      )}
    </div>
  );
}

/** Puts " · " between the parts of a row's detail that are there. */
function joined(parts: readonly React.ReactNode[]): React.ReactNode[] {
  return parts.filter(Boolean).map((part, index) => <Fragment key={index}>{index > 0 && ' · '}{part}</Fragment>);
}

function ItemRow({ name, detail, category, marker, amount, action, extra, transactions }: {
  name: string;
  detail?: string;
  /** Where the transactions are categorized, or a button that changes it; omitted when they are not. */
  category?: React.ReactNode;
  /** Says the user moved it, e.g. "kept by you". */
  marker?: string;
  amount?: string;
  action?: React.ReactNode;
  /** What shows below the row's line, before its transactions. */
  extra?: React.ReactNode;
  transactions?: TransactionsSpec;
}) {
  const describe = joined([detail, category, marker && <span className="font-semibold text-[#28704d]">{marker}</span>]);
  return (
    <li className="py-2.5 text-sm">
      {/* The figures and button move below a name that would otherwise be squeezed to a few letters. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 basis-36">
          <span className="line-clamp-2 break-words font-semibold text-[#102319]">{name}</span>
          {describe.length > 0 && <span className="text-xs text-[#66736b]">{describe}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {amount && <span className="font-bold tabular-nums text-[#102319]">{amount}</span>}
          {action}
        </span>
      </div>
      {extra}
      {/* An older report may list no transactions for an item. */}
      {(transactions?.transactions?.length ?? 0) > 0 && <Transactions spec={transactions!} />}
    </li>
  );
}

/**
 * What can be said about one transaction's payee from the transactions behind
 * a typical rate or a one-off: how often its amounts come, so a rare one is
 * spread over its own months, and leaving everything from it out.
 */
function PayeeChoices({ transaction, spread, basisDays, busy, onSpread, onLeaveOut }: {
  transaction: CashFlowItemTransaction;
  /** The choice that spreads its payee, if one does. */
  spread: CashFlowAdjustment | undefined;
  basisDays: number;
  busy: boolean;
  /** Spread the payee over these months, or count it over the basis again with null. */
  onSpread: (months: number | null) => void;
  /** Leave the payee out; omitted where that is not offered. */
  onLeaveOut?: () => void;
}) {
  const payee = transaction.label;
  const committed = spread?.spreadMonths ?? null;
  // Keep the user's pick while the save is in flight; the controlled value would
  // otherwise snap back to "Often" until the reloaded report carries the choice.
  const [draft, setDraft] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!busy) setDraft(undefined);
  }, [busy, committed]);
  const months = draft !== undefined ? draft : committed;
  return (
    <div className="mt-1.5 space-y-2 rounded-lg bg-[#f3f2e9] p-2.5 text-xs">
      <label className="block">
        <span className="font-semibold text-[#102319]">How often amounts from {payee} come</span>
        <select
          value={months ?? ''}
          disabled={busy}
          onChange={event => {
            const next = event.target.value ? Number(event.target.value) : null;
            setDraft(next);
            onSpread(next);
          }}
          className="mt-1 block w-full rounded-lg border border-[#102319]/15 bg-white px-2 py-1.5 text-xs text-[#102319] disabled:opacity-50"
        >
          <option value="">Often (your last {basisDays} days)</option>
          {SPREAD_CHOICES.map(choice => <option key={choice.months} value={choice.months}>{choice.label}</option>)}
        </select>
      </label>
      <p className="leading-5 text-[#66736b]">
        {months !== null
          ? `Each amount from ${payee} counts spread over the ${months} months after it, for as long as it’s that recent.`
          : 'For something that comes less often, like a yearly premium, pick how often: each amount is then spread over its own months instead.'}
      </p>
      {onLeaveOut && (
        <button
          type="button"
          onClick={onLeaveOut}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-[#102319]/15 bg-white px-2.5 py-1 font-bold text-[#102319] hover:border-[#102319]/35 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Leave out everything from {payee}
          <ArrowRight size={12} className="hidden lg:inline" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Opens a row's choices below it. */
function ChoicesToggle({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(shown => !shown)}
        className="font-semibold text-[#49725a] underline underline-offset-2 hover:text-[#102319]"
      >
        {open ? 'Hide choices' : 'Choices'}
      </button>
      {open && children}
    </div>
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

function Group({ title, note, children }: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 first:mt-0">
      <h5 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#49725a]">{title}</h5>
      {note && <p className="mt-1 text-xs leading-5 text-[#66736b]">{note}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * What sets each kind of counted flow apart at a glance: its own color and
 * icon, so money in, money out and transfers never read as the same list.
 * In and out match the cash flow chart's income and spending colors.
 */
const FLOW_SECTIONS = {
  in: { Icon: ArrowDownLeft, accent: '#2b8f5d', frame: 'border-[#2b8f5d]/30', header: 'border-[#2b8f5d]/20 bg-[#2b8f5d]/10' },
  out: { Icon: ArrowUpRight, accent: '#c46a4a', frame: 'border-[#c46a4a]/30', header: 'border-[#c46a4a]/20 bg-[#c46a4a]/10' },
  transfers: { Icon: ArrowLeftRight, accent: '#4f6d8a', frame: 'border-[#4f6d8a]/30', header: 'border-[#4f6d8a]/20 bg-[#4f6d8a]/10' },
} as const;

/** One kind of flow the forecast counts, framed under a header in its own color. */
function FlowSection({ tone, title, total, note, children }: {
  tone: keyof typeof FLOW_SECTIONS;
  title: string;
  /** The section's monthly figure, beside its title. */
  total?: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { Icon, accent, frame, header } = FLOW_SECTIONS[tone];
  return (
    <div className={`overflow-hidden rounded-2xl border bg-white/80 ${frame}`}>
      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-3 py-2.5 sm:px-4 ${header}`}>
        <h5 className="flex items-center gap-2 whitespace-nowrap text-base font-bold text-[#102319]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: accent }} aria-hidden="true">
            <Icon size={15} />
          </span>
          {title}
        </h5>
        {total && <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[#102319]">{total}</span>}
      </div>
      <div className="px-1.5 py-2.5 sm:p-3">
        {note && <p className="mb-2 text-xs leading-5 text-[#5e6b63]">{note}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * The colors that tie each part of a side to its share of the bar above them.
 * Card interest's differs from money out's, so it stands apart within it.
 */
const HALF_COLORS = { repeating: '#102319', spread: '#8fb8a0', interest: '#b7791f' } as const;
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

const HALF_ICONS = { repeating: CalendarClock, spread: Waves, interest: CreditCard } as const;

/**
 * One part of a side: what repeats on a schedule, everything else at the
 * typical rate, or the card interest spending carries. Each says how it is
 * projected and what it comes to.
 */
function Half({ kind, title, monthly, note, children }: {
  kind: HalfKind;
  title: string;
  /** Whole dollars, rounded with the other parts so they add up to the side. */
  monthly: number;
  note: string;
  children?: React.ReactNode;
}) {
  const Icon = HALF_ICONS[kind];
  return (
    <div className={`rounded-xl border px-2.5 py-3 sm:px-3.5 ${kind === 'interest' ? 'border-[#b7791f]/35 bg-[#b7791f]/[0.07]' : 'border-[#102319]/10 bg-white/70'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h6 className="flex items-center gap-1.5 text-sm font-bold text-[#102319]">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: HALF_COLORS[kind] }} aria-hidden="true" />
          <Icon size={14} className={`shrink-0 ${kind === 'interest' ? 'text-[#8a5a12]' : 'text-[#49725a]'}`} aria-hidden="true" />
          {title}
        </h6>
        <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[#102319]">
          {formatMoney(monthly)}<span className="font-normal text-[#66736b]"> a month</span>
        </span>
      </div>
      <p className="mt-0.5 text-xs leading-5 text-[#66736b]">{note}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

/** How each half of a side is projected, in the user's terms. */
const HALF_NOTES: Record<Flow, { repeating: string; spread: (days: number) => string }> = {
  income: {
    repeating: 'Paychecks and other income that arrive on a schedule. Each is projected on its own dates.',
    spread: days => `Income with no fixed schedule. Your last ${days} days, spread evenly across every day ahead. Anything you say comes less often is spread over its own months.`,
  },
  spending: {
    repeating: 'Bills and subscriptions that come on a schedule. Each is projected on its own dates.',
    spread: days => `Spending with no fixed schedule, like groceries, shopping and gas. Your last ${days} days, spread evenly across every day ahead. Anything you say comes less often, like a yearly premium, is spread over its own months.`,
  },
};

function Column({ title, description, tone, children }: {
  title: string;
  description: string;
  tone: 'in' | 'out';
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border p-3 sm:p-5 ${tone === 'in' ? 'border-[#28704d]/20 bg-[#c9f2df]/25' : 'border-[#102319]/10 bg-[#f3f2e9]/70'}`}>
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
    case 'exclude_category':
      return `Category left out of typical ${adjustment.flow}`;
    case 'spread_payee':
      return adjustment.spreadMonths === null
        ? `Spread over its own months in typical ${adjustment.flow}`
        : `Comes ${spreadLabel(adjustment.spreadMonths).toLowerCase()}: each amount spread over ${adjustment.spreadMonths} months`;
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
  const typicalCategories = report.typicalCategories ?? [];
  const basisDays = baseline.typicalBasisDays;

  // A monthly override from Finances replaces what that side learns from
  // transactions, so its items are not listed and a change to them would do nothing.
  const learned = (flow: Flow) => (flow === 'income' ? baseline.incomeSource : baseline.spendingSource) === 'transactions';
  // Leaving out spending still reshapes how a spending override is split
  // between cash and cards; nothing else reads what an overridden side learns.
  const cancelledByOverride = (adjustment: CashFlowAdjustment) => !learned(adjustment.flow)
    && (adjustment.kind === 'include_one_off' || adjustment.kind === 'continue_stream'
      || adjustment.kind === 'exclude_category' || adjustment.kind === 'spread_payee'
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
  // The report names the choice that holds a transaction in a typical rate:
  // counted although it looked like a one-off, or spread over its payee's months.
  const choice = (id: string | null | undefined) => (id ? adjustments.find(adjustment => adjustment.id === id) : undefined);
  // A one-off is not yet in a typical rate, so it has no spreadBy; look up the
  // payee's spread choice directly so the control can show what is already set.
  const payeeSpread = (transaction: CashFlowItemTransaction, flow: Flow) =>
    choice(transaction.spreadBy)
    ?? adjustments.find(adjustment =>
      adjustment.kind === 'spread_payee' && adjustment.flow === flow && adjustment.key === transaction.payeeKey);
  const spreadPayee = (transaction: CashFlowItemTransaction, flow: Flow, months: number | null) => {
    if (!transaction.payeeKey) return;
    if (months !== null) return adjust({ kind: 'spread_payee', flow, key: transaction.payeeKey, spreadMonths: months });
    const spread = payeeSpread(transaction, flow);
    return spread ? undo(spread) : undefined;
  };
  // Below a transaction in a typical rate: the user's choice that holds it there.
  const typicalMarkers = (transaction: CashFlowItemTransaction) => {
    const counted = choice(transaction.countedBy);
    const months = choice(transaction.spreadBy)?.spreadMonths ?? null;
    if (!counted && months === null) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {months !== null && <span className="font-semibold text-[#28704d]">{spreadLabel(months).toLowerCase()}, set by you</span>}
        {counted && <span className="font-semibold text-[#28704d]">counted by you</span>}
        {counted && <MoveButton label="Move back" item={transaction.label} toward="out" disabled={busy} onClick={() => undo(counted)} />}
      </div>
    );
  };
  // What a typical transaction's payee can be told: how often it comes, or to stay out.
  const typicalChoices = (transaction: CashFlowItemTransaction, flow: Flow) => (transaction.payeeKey ? {
    label: `Choices for ${transaction.label}`,
    content: (
      <PayeeChoices
        transaction={transaction}
        spread={payeeSpread(transaction, flow)}
        basisDays={basisDays}
        busy={busy}
        onSpread={months => void spreadPayee(transaction, flow, months)}
        onLeaveOut={() => void adjust({ kind: 'exclude_payee', flow, key: transaction.payeeKey! })}
      />
    ),
  } : null);

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
        transactions={{ ...item, flow: item.flow }}
        action={keptBy
          ? <MoveButton label="Stop counting" item={item.label} toward="out" disabled={busy} onClick={() => undo(keptBy)} />
          : <MoveButton label="Leave out" item={item.label} toward="out" disabled={busy} onClick={() => adjust({ kind: 'exclude_payee', flow: item.flow, key: item.payeeKey })} />}
      />
    );
  };
  const categoryRow = ({ category, dollars }: { category: CashFlowTypicalCategory; dollars: number }) => (
    <ItemRow
      key={`${category.flow}:${category.key}`}
      name={category.label}
      amount={`${formatMoney(dollars)}/mo`}
      transactions={{
        ...category,
        flow: category.flow,
        withLabels: true,
        renderExtra: typicalMarkers,
        renderChoices: transaction => typicalChoices(transaction, category.flow),
      }}
      action={<MoveButton label="Leave out" item={category.label} toward="out" disabled={busy} onClick={() => adjust({ kind: 'exclude_category', flow: category.flow, key: category.key })} />}
    />
  );

  // A side's usual month, split into its two halves, plus the card interest
  // spending carries. The halves are rounded together, so the shown figures
  // add up to the side's total.
  const split = (flow: Flow) => {
    const regular = report.recurring.filter(item => item.flow === flow && item.status === 'active');
    const categories = typicalCategories.filter(category => category.flow === flow);
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
    // Each category's dollars, rounded together so they add up to the half they
    // make; the report's categories add up to it, so only rounding is shared out.
    const categoriesTotal = categories.reduce((sum, category) => sum + category.monthlyAmount, 0);
    const categoryDollars = roundToTotal(
      categories.map(category => category.monthlyAmount),
      Math.abs(categoriesTotal - spreadShown) <= 1 ? spreadShown : categoriesTotal,
    );
    const typical = categories.map((category, index) => ({ category, dollars: categoryDollars[index] }));
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
            <CappedList items={parts.typical} render={categoryRow} empty={`Nothing else in your last ${basisDays} days.`} />
          </Half>
          {parts.interest > 0 && (
            <Half kind="interest" title="Card interest" monthly={parts.interest} note="Projected from each card’s APR at your usual payment pace." />
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
  const leftOutByUser = adjustments.filter(adjustment =>
    adjustment.kind === 'exclude_payee' || adjustment.kind === 'exclude_transfer' || adjustment.kind === 'exclude_category');
  const leftOutWhat = (adjustment: CashFlowAdjustment) => {
    if (adjustment.kind === 'exclude_transfer') return adjustment.flow === 'income' ? 'Transfer in' : 'Transfer out';
    const side = adjustment.flow === 'income' ? 'Money in' : 'Money out';
    return adjustment.kind === 'exclude_category' ? `Category · ${side}` : side;
  };
  const thresholdText = thresholds && oneOffSides.length > 0
    ? oneOffSides
      .map(flow => `${formatMoney(thresholds[flow])} or more ${flow === 'income' ? 'received' : 'spent'}`)
      .join(', or ')
    : null;
  const transfers = report.position.available ? report.position.transfers : null;
  const showTransfers = transfers !== null && (transfers.recurring.length > 0 || Math.round(transfers.typicalMonthlyNet) !== 0);

  return (
    <BoardContext.Provider value={{ apiUrl, onChanged }}>
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
            <div className="space-y-4">
              <FlowSection tone="in" title="Money in" total={sideTotal('income')}>{side('income')}</FlowSection>
              <FlowSection tone="out" title="Money out" total={sideTotal('spending')}>{side('spending')}</FlowSection>
              {showTransfers && transfers && (
                <FlowSection
                  tone="transfers"
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
                        transactions={{ ...item, flow: item.direction === 'in' ? 'income' : 'spending' }}
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
                </FlowSection>
              )}
            </div>
          </Column>

          <Column title="Left out" description="Not projected. Move anything back in." tone="out">
            <Group
              title="One-offs"
              note={thresholdText
                ? `A large amount that stands out from everything else from its payee in your last ${basisDays} days: ${thresholdText}, and at least twice the rest from that payee. Amounts within ten days of each other, like a sum moved in pieces, count together. Counting one spreads it over those ${basisDays} days, as if amounts like it come that often; if they come less often, say how often under Choices.`
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
                    // An older report carries no category picker values, and offers nothing to change.
                    category={item.categoryCodes ? <CategoryButton transaction={item} flow={item.flow} onChanged={onChanged} /> : item.category}
                    amount={`${item.flow === 'income' ? '+' : ''}${formatMoney(item.amount, true)}`}
                    action={<MoveButton label="Count it" item={item.label} toward="in" disabled={busy} onClick={() => adjust({ kind: 'include_one_off', flow: item.flow, key: item.id })} />}
                    extra={item.payeeKey ? (
                      <div className="mt-1">
                        <ChoicesToggle label={`Choices for ${item.label}`}>
                          <PayeeChoices
                            transaction={item}
                            spread={payeeSpread(item, item.flow)}
                            basisDays={basisDays}
                            busy={busy}
                            onSpread={months => void spreadPayee(item, item.flow, months)}
                          />
                        </ChoicesToggle>
                      </div>
                    ) : undefined}
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
                    transactions={{ ...item, flow: item.flow }}
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
                    detail={`${leftOutWhat(adjustment)}${overrideNote(adjustment)}`}
                    category={adjustment.kind === 'exclude_category' ? undefined : adjustment.transactions?.[0]?.category}
                    transactions={{ ...adjustment, flow: adjustment.flow, withLabels: adjustment.kind === 'exclude_category' }}
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
    </BoardContext.Provider>
  );
}
