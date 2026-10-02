"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type {
  CashFlowAdjustment,
  CashFlowRecurringItem,
  CashFlowReport,
  CashFlowTypicalPayee,
  ForecastAdjustmentKind,
} from '../../types/cash-flow';
import { sendCashFlowRequest } from '../../lib/cash-flow-api';
import { CADENCE_LABELS, formatCalendarDate, formatMoney } from '../../lib/cash-flow-format';

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

function ItemRow({ name, detail, marker, amount, action }: {
  name: string;
  detail?: string;
  /** Says the user moved it, e.g. "kept by you". */
  marker?: string;
  amount?: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="min-w-0">
        <span className="line-clamp-2 break-words font-semibold text-[#102319]">{name}</span>
        {(detail || marker) && (
          <span className="text-xs text-[#66736b]">
            {detail}
            {detail && marker ? ' · ' : ''}
            {marker && <span className="font-semibold text-[#28704d]">{marker}</span>}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {amount && <span className="font-bold tabular-nums text-[#102319]">{amount}</span>}
        {action}
      </span>
    </li>
  );
}

/** The first few items, and a button for the rest. */
function CappedList<T>({ items, render, empty }: {
  items: readonly T[];
  render: (item: T) => React.ReactNode;
  empty?: string;
}) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return empty ? <p className="py-1.5 text-sm text-[#66736b]">{empty}</p> : null;
  const hidden = items.length - LIST_LIMIT;
  return (
    <>
      <ul className="divide-y divide-[#102319]/10">{(all || hidden <= 0 ? items : items.slice(0, LIST_LIMIT)).map(render)}</ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setAll(shown => !shown)} className="mt-1 text-xs font-bold text-[#102319] underline">
          {all ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}

function Group({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <h5 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#49725a]">{title}</h5>
      {note && <p className="mt-1 text-xs leading-5 text-[#66736b]">{note}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

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
  const kept = (item: CashFlowRecurringItem) => adjustments.find(adjustment =>
    adjustment.kind === 'continue_stream' && adjustment.flow === item.flow && adjustment.key === item.payeeKey);
  // Only a change that is what puts a transaction in the typical rate counts:
  // one whose one-off aged out, or whose payee now repeats, does nothing here.
  const countedBy = (payee: CashFlowTypicalPayee) => adjustments.find(adjustment =>
    adjustment.kind === 'include_one_off' && (payee.countedOneOffIds ?? []).includes(adjustment.key));

  const regularRow = (item: CashFlowRecurringItem) => {
    const keptBy = item.continuedByUser ? kept(item) : undefined;
    return (
      <ItemRow
        key={item.id}
        name={item.label}
        detail={`${CADENCE_LABELS[item.cadence]}${item.nextDate ? ` · next ${formatCalendarDate(item.nextDate)}` : ''}`}
        marker={item.continuedByUser ? 'kept by you' : undefined}
        amount={formatMoney(item.amount, true)}
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
        marker={counted ? 'counted by you' : undefined}
        amount={`${formatMoney(payee.monthlyAmount)}/mo`}
        action={counted
          ? <MoveButton label="Move back" item={payee.label} toward="out" disabled={busy} onClick={() => undo(counted)} />
          : <MoveButton label="Leave out" item={payee.label} toward="out" disabled={busy} onClick={() => adjust({ kind: 'exclude_payee', flow: payee.flow, key: payee.payeeKey })} />}
      />
    );
  };

  const side = (flow: Flow) => {
    const regular = report.recurring.filter(item => item.flow === flow && item.status === 'active');
    const typical = typicalPayees.filter(payee => payee.flow === flow);
    const monthly = flow === 'income' ? baseline.typicalMonthlyIncome : baseline.typicalMonthlySpending;
    const override = flow === 'income' ? baseline.monthlyIncomeOverride : baseline.monthlyExpenseOverride;
    if (!learned(flow)) {
      return (
        <p className="py-1.5 text-sm text-[#5e6b63]">
          Your monthly {flow} of {formatMoney(override ?? 0)} from the Finances page is used instead.
        </p>
      );
    }
    const typicalShown = monthly >= 1;
    return (
      <>
        <CappedList
          items={regular}
          render={regularRow}
          empty={typicalShown ? undefined : `No ${flow === 'income' ? 'income' : 'spending'} found in your history yet.`}
        />
        {typicalShown && (
          <div className="mt-3 rounded-xl border border-[#102319]/10 bg-white/60 px-3.5 py-2.5">
            <p className="text-sm text-[#5e6b63]">
              <span className="font-semibold text-[#102319]">Other {flow}</span>: about{' '}
              <strong className="text-[#102319]">{formatMoney(monthly)}</strong> a month, spread evenly, from your last {basisDays} days
            </p>
            <CappedList items={typical} render={typicalRow} />
          </div>
        )}
      </>
    );
  };

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
          <Group title="Money in">{side('income')}</Group>
          <Group title="Money out">{side('spending')}</Group>
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
                    detail={`${CADENCE_LABELS[item.cadence]}${item.nextDate ? ` · next ${formatCalendarDate(item.nextDate)}` : ''}`}
                    amount={`${item.direction === 'in' ? '+' : '−'}${formatMoney(item.amount, true)}`}
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
              ? `A large amount from a payee seen only once in your last ${basisDays} days: ${thresholdText}. Counting one spreads it over those ${basisDays} days, as if amounts like it come that often.`
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
                  detail={`${CADENCE_LABELS[item.cadence]} · last ${formatCalendarDate(item.lastDate)}`}
                  amount={formatMoney(item.amount, true)}
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
