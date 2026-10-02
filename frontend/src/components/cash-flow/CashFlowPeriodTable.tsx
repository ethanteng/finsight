"use client";

import type { CashFlowPeriod, CashFlowReport } from '../../types/cash-flow';
import {
  cardName,
  formatCalendarDate,
  formatMoney,
  formatSignedMoney,
  periodLabel,
  projectsCardDebt,
} from '../../lib/cash-flow-format';

function basis(period: CashFlowPeriod): string {
  if (period.phase === 'future') return 'Forecast';
  if (period.coverage === 'none') return 'No history';
  const partial = period.coverage === 'partial' ? ' (partial)' : '';
  return period.phase === 'past' ? `Actual${partial}` : `Actual${partial} + forecast`;
}

export default function CashFlowPeriodTable({ report }: { report: CashFlowReport }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-[#102319]/10 text-left text-xs font-bold uppercase tracking-wider text-[#66736b]">
            <th scope="col" className="py-2 pr-4 font-bold">Period</th>
            <th scope="col" className="py-2 pr-4 text-right font-bold">Cash in</th>
            <th scope="col" className="py-2 pr-4 text-right font-bold">Cash out</th>
            <th scope="col" className="py-2 pr-4 text-right font-bold">Net</th>
            <th scope="col" className="py-2 font-bold">Based on</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#102319]/10">
          {report.periods.map(period => (
            <tr key={period.key} className={period.phase === 'future' ? 'text-[#5e6b63]' : 'text-[#102319]'}>
              <th scope="row" className="py-2.5 pr-4 text-left font-semibold">{periodLabel(period, report.granularity)}</th>
              <td className="py-2.5 pr-4 text-right tabular-nums">{period.total ? formatMoney(period.total.income) : '—'}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{period.total ? formatMoney(period.total.spending) : '—'}</td>
              <td className={`py-2.5 pr-4 text-right font-bold tabular-nums ${period.total && period.total.net < 0 ? 'text-[#9b4137]' : ''}`}>
                {period.total ? formatSignedMoney(period.total.net) : '—'}
              </td>
              <td className="py-2.5 text-xs text-[#66736b]">{basis(period)}</td>
            </tr>
          ))}
        </tbody>
        {report.totals.total && (
          <tfoot>
            <tr className="border-t-2 border-[#102319]/15 font-bold text-[#102319]">
              <th scope="row" className="py-2.5 pr-4 text-left">Total</th>
              <td className="py-2.5 pr-4 text-right tabular-nums">{formatMoney(report.totals.total.income)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{formatMoney(report.totals.total.spending)}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{formatSignedMoney(report.totals.total.net)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
      {report.totals.coverage === 'partial' && report.coverageStart && (
        <p className="mt-3 text-xs leading-5 text-[#76510f]">
          No totals for this range: your history starts {formatCalendarDate(report.coverageStart)}, after the range begins,
          so the days before it can’t be added up.
        </p>
      )}
    </div>
  );
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : formatMoney(value);
}

/** The cash position by period: what cash pays the cards, and the balances at each period's end. */
export function CashPositionPeriodTable({ report }: { report: CashFlowReport }) {
  const hasCards = projectsCardDebt(report);
  const leftOut = new Set(report.position.cardsLeftOut.map(card => card.accountId));
  // Their balances are in what's owed, but their payments never leave the connected cash.
  const paidElsewhere = report.cards.filter(card => !leftOut.has(card.accountId) && card.paymentSource === 'other');
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${hasCards ? 'min-w-[440px]' : ''}`}>
        <thead>
          <tr className="border-b border-[#102319]/10 text-left text-xs font-bold uppercase tracking-wider text-[#66736b]">
            <th scope="col" className="py-2 pr-4 font-bold">Period</th>
            {hasCards && <th scope="col" className="py-2 pr-4 text-right font-bold">Paid to cards</th>}
            <th scope="col" className={`py-2 text-right font-bold ${hasCards ? 'pr-4' : ''}`}>Cash at end</th>
            {hasCards && <th scope="col" className="py-2 text-right font-bold">Owed on cards at end</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#102319]/10">
          {report.periods.map((period, index) => {
            // In step with the periods; a period over before the forecast has no figures.
            const point = report.position.periods[index];
            return (
              <tr key={period.key} className={period.phase === 'future' ? 'text-[#5e6b63]' : 'text-[#102319]'}>
                <th scope="row" className="py-2.5 pr-4 text-left font-semibold">{periodLabel(period, report.granularity)}</th>
                {hasCards && <td className="py-2.5 pr-4 text-right tabular-nums">{money(point?.cardPayments)}</td>}
                <td className={`py-2.5 text-right font-bold tabular-nums ${hasCards ? 'pr-4' : ''} ${(point?.cash ?? 0) < 0 ? 'text-[#9b4137]' : ''}`}>
                  {money(point?.cash)}
                </td>
                {hasCards && <td className="py-2.5 text-right tabular-nums">{money(point?.cardDebt)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasCards && paidElsewhere.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-[#76510f]">
          Paid to cards leaves out {paidElsewhere.map(cardName).join(', ')}: {paidElsewhere.length === 1 ? 'its' : 'their'} payments
          don’t seem to come from your connected accounts.
        </p>
      )}
    </div>
  );
}
