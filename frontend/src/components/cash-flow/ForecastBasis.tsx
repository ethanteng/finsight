"use client";

import Link from 'next/link';
import type { CashFlowCardSummary, CashFlowReport } from '../../types/cash-flow';
import { cardName, formatCalendarDate } from '../../lib/cash-flow-format';

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // min-w-0 lets the grid column narrow on a phone instead of widening the page.
  return (
    <div className="min-w-0">
      <h4 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#49725a]">{title}</h4>
      {children}
    </div>
  );
}

/** What the forecast is built from. The items themselves, and moving them in or out, are in ForecastBoard. */
export default function ForecastBasis({ report }: { report: CashFlowReport }) {
  return (
    <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="forecast-basis-heading">
      <h3 id="forecast-basis-heading" className="text-lg font-semibold text-[#102319]">How this forecast works</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5e6b63]">
        Regular income and bills found in your history, on their own schedule, plus your typical spending on
        everything else, plus your planned events. Card purchases count when you make them; card payments and
        transfers between your own accounts aren’t income or spending.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {report.cards.length > 0 && (
          <Section title="Credit card interest">
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[#5e6b63]">
              {report.cards.map(card => (
                <li key={card.accountId}>
                  <span className="font-semibold text-[#102319]">{cardName(card)}</span>
                  {': '}
                  {interestBasis(card, report.baseline.spendingSource === 'override')}
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
