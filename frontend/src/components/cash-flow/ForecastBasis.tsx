"use client";

import { useState } from 'react';
import Link from 'next/link';
import type {
  CashFlowAdjustment,
  CashFlowCardSummary,
  CashFlowRecurringItem,
  CashFlowReport,
  CashFlowTypicalPayee,
  ForecastAdjustmentKind,
} from '../../types/cash-flow';
import { sendCashFlowRequest } from '../../lib/cash-flow-api';
import {
  CADENCE_LABELS,
  cardName,
  formatCalendarDate,
  formatMoney,
} from '../../lib/cash-flow-format';

type Flow = 'income' | 'spending';

/** What one button asks the server to change. */
interface AdjustmentRequest {
  kind: ForecastAdjustmentKind;
  flow: Flow;
  key: string;
}

/** A small button that changes what the forecast counts; its accessible name says which item. */
function ChangeButton({ label, item, disabled, onClick }: { label: string; item: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${item}`}
      className="shrink-0 rounded-full border border-[#102319]/15 bg-white/70 px-2.5 py-1 text-xs font-bold text-[#102319] transition hover:border-[#102319]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function StreamList({ items, empty, action }: {
  items: CashFlowRecurringItem[];
  empty: string;
  action: (item: CashFlowRecurringItem) => React.ReactNode;
}) {
  if (items.length === 0) return <p className="mt-2 text-sm text-[#66736b]">{empty}</p>;
  return (
    <ul className="mt-2 divide-y divide-[#102319]/10">
      {items.map(item => (
        <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="line-clamp-2 break-words font-semibold text-[#102319]">{item.label}</span>
            <span className="text-xs text-[#66736b]">
              {CADENCE_LABELS[item.cadence]}
              {item.nextDate ? ` · next ${formatCalendarDate(item.nextDate)}` : ''}
              {item.continuedByUser ? ' · kept by you' : ''}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="font-bold tabular-nums text-[#102319]">{formatMoney(item.amount, true)}</span>
            {action(item)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PayeeList({ payees, action }: { payees: CashFlowTypicalPayee[]; action: (payee: CashFlowTypicalPayee) => React.ReactNode }) {
  return (
    <ul className="mt-2 divide-y divide-[#102319]/10">
      {payees.map(payee => (
        <li key={`${payee.flow}:${payee.payeeKey}`} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0 line-clamp-2 break-words text-[#102319]">{payee.label}</span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="tabular-nums text-[#102319]">{formatMoney(payee.monthlyAmount)}/mo</span>
            {action(payee)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** How the forecast treats one card's interest, in the user's terms. */
function interestBasis(card: CashFlowCardSummary, spendingOverride: boolean): string {
  const carriedForward = 'recent interest charges are carried forward like other spending.';
  if (card.apr === null) return `the bank doesn’t share its APR, so ${carriedForward}`;
  if (card.balance === null) return `its balance isn’t reported, so ${carriedForward}`;
  if (!card.currentPace && !card.withPlans) return `there isn’t enough payment history to project its interest yet, so ${carriedForward}`;
  const apr = `${card.apr}% APR on any part of a statement left unpaid`;
  if (spendingOverride) return `your monthly spending from the Finances page already includes its interest; its balance is projected at ${apr}.`;
  if (card.currentPace) return `projected at ${apr}.`;
  return `recent interest charges stay in the forecast as they were; with your plan, its balance is projected at ${apr}.`;
}

/** What a saved change did, in the user's terms. */
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // min-w-0 lets the grid column narrow on a phone, so long labels truncate
  // instead of pushing their row's amount and button off the screen.
  return (
    <div className="min-w-0">
      <h4 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#49725a]">{title}</h4>
      {children}
    </div>
  );
}

export default function ForecastBasis({ report, apiUrl, onChanged }: {
  report: CashFlowReport;
  apiUrl: string;
  /** Reload the report after the user changes what the forecast counts. */
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = report.recurring.filter(item => item.status === 'active');
  const income = active.filter(item => item.flow === 'income');
  const bills = active.filter(item => item.flow === 'spending');
  const lapsed = report.recurring.filter(item => item.status === 'lapsed');
  const { baseline } = report;
  // Defaults keep a newer page from crashing if the report is from an older API.
  const adjustments = report.adjustments ?? [];
  const typicalPayees = report.typicalPayees ?? [];
  const typicalSpending = typicalPayees.filter(payee => payee.flow === 'spending');
  const typicalIncome = typicalPayees.filter(payee => payee.flow === 'income');
  const readsTypicalSpending = baseline.spendingSource === 'transactions';
  const readsTypicalIncome = baseline.incomeSource === 'transactions';

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
  const savedFor = (kind: ForecastAdjustmentKind, flow: Flow, key: string) =>
    adjustments.find(adjustment => adjustment.kind === kind && adjustment.flow === flow && adjustment.key === key);

  const leaveOut = (item: CashFlowRecurringItem) => {
    const kept = item.continuedByUser ? savedFor('continue_stream', item.flow, item.payeeKey) : undefined;
    return kept
      ? <ChangeButton label="Stop counting" item={item.label} disabled={busy} onClick={() => undo(kept)} />
      : <ChangeButton label="Leave out" item={item.label} disabled={busy} onClick={() => adjust({ kind: 'exclude_payee', flow: item.flow, key: item.payeeKey })} />;
  };
  const leaveOutPayee = (payee: CashFlowTypicalPayee) => (
    <ChangeButton label="Leave out" item={payee.label} disabled={busy} onClick={() => adjust({ kind: 'exclude_payee', flow: payee.flow, key: payee.payeeKey })} />
  );

  return (
    <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="forecast-basis-heading">
      <h3 id="forecast-basis-heading" className="text-lg font-semibold text-[#102319]">How this forecast works</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5e6b63]">
        Regular income and bills found in your history, on their own schedule, plus your typical spending on
        everything else, plus your planned events. Card purchases count when you make them; card payments and
        transfers between your own accounts aren’t income or spending.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6b63]">
        Leave out anything that shouldn’t count, or count something that was left out. Your changes only affect the
        forecast; past months stay as they happened. If something isn’t really income or spending, like a transfer to
        your own account, change its category in{' '}
        <Link href="/profile" className="font-semibold text-[#102319] underline">Accounts &amp; context</Link> instead,
        which corrects your history too.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-[#b84a3d]/25 bg-[#f8e8e3] px-3.5 py-2.5 text-sm text-[#8b3027]">
          {error}
        </p>
      )}

      {adjustments.length > 0 && (
        <div className="mt-5 rounded-2xl border border-[#102319]/10 bg-white/60 p-4">
          <h4 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#49725a]">Your changes</h4>
          <ul className="mt-2 divide-y divide-[#102319]/10">
            {adjustments.map(adjustment => (
              <li key={adjustment.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="line-clamp-2 break-words font-semibold text-[#102319]">{adjustment.label}</span>
                  <span className="text-xs text-[#66736b]">{describeAdjustment(adjustment)}</span>
                </span>
                <ChangeButton label="Undo" item={adjustment.label} disabled={busy} onClick={() => undo(adjustment)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <Section title="Regular income">
          {baseline.incomeSource === 'override' && baseline.monthlyIncomeOverride !== null ? (
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              Using your monthly income of {formatMoney(baseline.monthlyIncomeOverride)} from the Finances page instead.
            </p>
          ) : (
            <StreamList items={income} empty="No regular income found yet." action={leaveOut} />
          )}
        </Section>

        <Section title="Regular bills">
          {baseline.spendingSource === 'override' && baseline.monthlyExpenseOverride !== null ? (
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              Using your monthly spending of {formatMoney(baseline.monthlyExpenseOverride)} from the Finances page instead.
            </p>
          ) : (
            <StreamList items={bills} empty="No regular bills found yet." action={leaveOut} />
          )}
        </Section>

        {(readsTypicalSpending || readsTypicalIncome) && (
          <Section title="Everything else">
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              {readsTypicalSpending && readsTypicalIncome && baseline.typicalMonthlyIncome >= 1 ? (
                <>
                  About <strong className="text-[#102319]">{formatMoney(baseline.typicalMonthlySpending)}</strong> a month of other spending
                  {' '}and <strong className="text-[#102319]">{formatMoney(baseline.typicalMonthlyIncome)}</strong> of other income
                </>
              ) : readsTypicalSpending ? (
                <>About <strong className="text-[#102319]">{formatMoney(baseline.typicalMonthlySpending)}</strong> a month of other spending</>
              ) : (
                <>About <strong className="text-[#102319]">{formatMoney(baseline.typicalMonthlyIncome)}</strong> a month of other income</>
              )}
              , spread evenly, based on your last {baseline.typicalBasisDays} days.
            </p>
            {((readsTypicalSpending && typicalSpending.length > 0) || (readsTypicalIncome && typicalIncome.length > 0)) && (
              <details className="mt-2 rounded-xl border border-[#102319]/10 bg-white/50 px-3.5 py-2.5">
                <summary className="cursor-pointer text-sm font-bold text-[#102319]">What this is made of</summary>
                {readsTypicalSpending && typicalSpending.length > 0 && <PayeeList payees={typicalSpending} action={leaveOutPayee} />}
                {readsTypicalIncome && typicalIncome.length > 0 && (
                  <>
                    {readsTypicalSpending && typicalSpending.length > 0 && (
                      <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.14em] text-[#49725a]">Other income</p>
                    )}
                    <PayeeList payees={typicalIncome} action={leaveOutPayee} />
                  </>
                )}
              </details>
            )}
          </Section>
        )}

        {report.oneOffs.length > 0 && (
          <Section title="Left out as one-offs">
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              Large amounts that didn’t repeat aren’t assumed to happen again. Count one if amounts like it are part of
              your usual income or spending: it’s spread over your last {baseline.typicalBasisDays} days, as if amounts like
              it come that often. If you know when it will happen again, add it as a planned event instead.
            </p>
            <ul className="mt-2 divide-y divide-[#102319]/10">
              {report.oneOffs.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 line-clamp-2 break-words text-[#102319]">
                    {item.label} <span className="text-xs text-[#66736b]">· {formatCalendarDate(item.date)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-bold tabular-nums text-[#102319]">
                      {item.flow === 'income' ? '+' : ''}{formatMoney(item.amount, true)}
                    </span>
                    <ChangeButton
                      label="Count it"
                      item={item.label}
                      disabled={busy}
                      onClick={() => adjust({ kind: 'include_one_off', flow: item.flow, key: item.id })}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {report.cards.length > 0 && (
          <Section title="Credit card interest">
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[#5e6b63]">
              {report.cards.map(card => (
                <li key={card.accountId}>
                  <span className="font-semibold text-[#102319]">{cardName(card)}</span>
                  {': '}
                  {interestBasis(card, baseline.spendingSource === 'override')}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {report.position.available && (report.position.transfers.recurring.length > 0 || Math.round(report.position.transfers.typicalMonthlyNet) !== 0) && (
          <Section title="Transfers (cash position)">
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              Money moving to or from accounts that aren’t connected here, such as investments, which changes your cash but
              isn’t income or spending.
            </p>
            <ul className="mt-2 divide-y divide-[#102319]/10">
              {report.position.transfers.recurring.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="line-clamp-2 break-words font-semibold text-[#102319]">{item.label}</span>
                    <span className="text-xs text-[#66736b]">
                      {CADENCE_LABELS[item.cadence]}{item.nextDate ? ` · next ${formatCalendarDate(item.nextDate)}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-bold tabular-nums text-[#102319]">
                      {item.direction === 'in' ? '+' : '−'}{formatMoney(item.amount, true)}
                    </span>
                    <ChangeButton
                      label="Leave out"
                      item={item.label}
                      disabled={busy}
                      onClick={() => adjust({ kind: 'exclude_transfer', flow: item.direction === 'in' ? 'income' : 'spending', key: item.payeeKey })}
                    />
                  </span>
                </li>
              ))}
            </ul>
            {Math.round(report.position.transfers.typicalMonthlyNet) !== 0 && (
              <p className="mt-2 text-xs leading-5 text-[#66736b]">
                Plus about {formatMoney(Math.abs(report.position.transfers.typicalMonthlyNet))} a month
                {report.position.transfers.typicalMonthlyNet < 0 ? ' out' : ' in'} in other transfers, spread evenly.
              </p>
            )}
          </Section>
        )}

        {lapsed.length > 0 && (
          <Section title="Stopped">
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              These used to repeat but haven’t lately, so they’re not in the forecast. Keep counting one you know will continue.
            </p>
            <ul className="mt-2 divide-y divide-[#102319]/10">
              {lapsed.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 line-clamp-2 break-words text-[#5e6b63]">{item.label} · last {formatCalendarDate(item.lastDate)}</span>
                  <ChangeButton
                    label="Keep counting"
                    item={item.label}
                    disabled={busy}
                    onClick={() => adjust({ kind: 'continue_stream', flow: item.flow, key: item.payeeKey })}
                  />
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Accounts included">
          <ul className="mt-2 space-y-1 text-sm text-[#102319]">
            {report.accounts.map(account => (
              <li key={account.id}>
                {account.name}
                {account.mask ? ` ••${account.mask}` : ''}
                <span className="text-xs text-[#66736b]"> · {account.kind === 'credit' ? 'Credit card' : 'Cash'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-[#66736b]">
            Investment accounts and loans aren’t included. History starts {report.coverageStart ? formatCalendarDate(report.coverageStart) : 'when your accounts are connected'}.
          </p>
          {report.excluded.unclassified > 0 && (
            <p className="mt-2 text-xs leading-5 text-[#76510f]">
              {report.excluded.unclassified} transaction{report.excluded.unclassified === 1 ? '' : 's'} couldn’t be classified and aren’t counted.
              You can set their categories in <Link href="/profile" className="font-semibold underline">Accounts &amp; context</Link>.
            </p>
          )}
        </Section>
      </div>
    </section>
  );
}
