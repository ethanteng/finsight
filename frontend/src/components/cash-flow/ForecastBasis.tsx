"use client";

import Link from 'next/link';
import type { CashFlowRecurringItem, CashFlowReport } from '../../types/cash-flow';
import {
  CADENCE_LABELS,
  formatCalendarDate,
  formatMoney,
} from '../../lib/cash-flow-format';

function StreamList({ items, empty }: { items: CashFlowRecurringItem[]; empty: string }) {
  if (items.length === 0) return <p className="mt-2 text-sm text-[#66736b]">{empty}</p>;
  return (
    <ul className="mt-2 divide-y divide-[#102319]/10">
      {items.map(item => (
        <li key={item.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-semibold text-[#102319]">{item.label}</span>
            <span className="text-xs text-[#66736b]">
              {CADENCE_LABELS[item.cadence]}
              {item.nextDate ? ` · next ${formatCalendarDate(item.nextDate)}` : ''}
            </span>
          </span>
          <span className="shrink-0 font-bold tabular-nums text-[#102319]">{formatMoney(item.amount, true)}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#49725a]">{title}</h4>
      {children}
    </div>
  );
}

export default function ForecastBasis({ report }: { report: CashFlowReport }) {
  const active = report.recurring.filter(item => item.status === 'active');
  const income = active.filter(item => item.flow === 'income');
  const bills = active.filter(item => item.flow === 'spending');
  const lapsed = report.recurring.filter(item => item.status === 'lapsed');
  const { baseline } = report;

  return (
    <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="forecast-basis-heading">
      <h3 id="forecast-basis-heading" className="text-lg font-semibold text-[#102319]">How this forecast works</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5e6b63]">
        Regular income and bills found in your history, on their own schedule, plus your typical spending on
        everything else, plus your planned events. Card purchases count when you make them; card payments and
        transfers between your own accounts aren’t income or spending.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <Section title="Regular income">
          {baseline.incomeSource === 'override' && baseline.monthlyIncomeOverride !== null ? (
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              Using your monthly income of {formatMoney(baseline.monthlyIncomeOverride)} from the Finances page instead.
            </p>
          ) : (
            <StreamList items={income} empty="No regular income found yet." />
          )}
        </Section>

        <Section title="Regular bills">
          {baseline.spendingSource === 'override' && baseline.monthlyExpenseOverride !== null ? (
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              Using your monthly spending of {formatMoney(baseline.monthlyExpenseOverride)} from the Finances page instead.
            </p>
          ) : (
            <StreamList items={bills} empty="No regular bills found yet." />
          )}
        </Section>

        {baseline.spendingSource === 'transactions' && (
          <Section title="Everything else">
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              About <strong className="text-[#102319]">{formatMoney(baseline.typicalMonthlySpending)}</strong> a month of other spending
              {baseline.incomeSource === 'transactions' && baseline.typicalMonthlyIncome >= 1
                ? <> and <strong className="text-[#102319]">{formatMoney(baseline.typicalMonthlyIncome)}</strong> of other income</>
                : null}
              , spread evenly, based on your last {baseline.typicalBasisDays} days.
            </p>
          </Section>
        )}

        {report.oneOffs.length > 0 && (
          <Section title="Left out as one-offs">
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">
              Large amounts that didn’t repeat aren’t assumed to happen again. If one will, add it as a planned event.
            </p>
            <ul className="mt-2 divide-y divide-[#102319]/10">
              {report.oneOffs.map(item => (
                <li key={item.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                  <span className="min-w-0 truncate text-[#102319]">
                    {item.label} <span className="text-xs text-[#66736b]">· {formatCalendarDate(item.date)}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-[#102319]">
                    {item.flow === 'income' ? '+' : ''}{formatMoney(item.amount, true)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {lapsed.length > 0 && (
          <Section title="Stopped">
            <p className="mt-2 text-sm leading-6 text-[#5e6b63]">These used to repeat but haven’t lately, so they’re not in the forecast.</p>
            <ul className="mt-2 space-y-1 text-sm text-[#5e6b63]">
              {lapsed.map(item => (
                <li key={item.id}>{item.label} · last {formatCalendarDate(item.lastDate)}</li>
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
              You can set their categories on <Link href="/finances" className="font-semibold underline">Finances</Link>.
            </p>
          )}
        </Section>
      </div>
    </section>
  );
}
