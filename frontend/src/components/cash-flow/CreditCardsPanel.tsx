"use client";

import { CreditCard } from 'lucide-react';
import type { CardOutcome, CashFlowCardSummary } from '../../types/cash-flow';
import { cardName, formatCalendarDate, formatMoney, monthLabel, paceDescription } from '../../lib/cash-flow-format';

function payoffLine(outcome: CardOutcome): string {
  if (!outcome.carryingBalanceNow) return 'Not carrying a balance';
  return outcome.paidOffBy ? `Balance paid off by ${monthLabel(outcome.paidOffBy)}` : 'Still carrying a balance in two years';
}

/** "Next payment $614 from your cash on Oct 28, 2026 · $7,368 over the next 12 months"; null when nothing is paid. */
function paymentLine(outcome: CardOutcome, paymentSource: CashFlowCardSummary['paymentSource']): string | null {
  if (!outcome.nextPayment) return null;
  // Only a card paid from the connected accounts takes its payments out of the projected cash.
  const fromCash = paymentSource === 'connected' ? ' from your cash' : '';
  const next = `Next payment ${formatMoney(outcome.nextPayment.amount)}${fromCash} on ${formatCalendarDate(outcome.nextPayment.date)}`;
  // A first payment more than a year out leaves nothing to total over the next 12 months.
  return outcome.paymentsTwelveMonths > 0
    ? `${next} · ${formatMoney(outcome.paymentsTwelveMonths)} over the next 12 months`
    : next;
}

function Outcome({ title, outcome, paymentSource, tone }: {
  title: string;
  outcome: CardOutcome;
  paymentSource: CashFlowCardSummary['paymentSource'];
  tone: 'muted' | 'plan';
}) {
  const payments = paymentLine(outcome, paymentSource);
  return (
    <div className={`rounded-2xl border p-4 ${tone === 'plan' ? 'border-[#28704d]/25 bg-[#c9f2df]/40' : 'border-[#102319]/10 bg-white/60'}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#49725a]">{title}</p>
      <p className="mt-2 text-sm font-bold text-[#102319]">{payoffLine(outcome)}</p>
      {payments && <p className="mt-1 text-sm text-[#5e6b63]">{payments}</p>}
      <p className="mt-1 text-sm text-[#5e6b63]">
        {outcome.interestTwelveMonths === null
          ? 'Interest unknown: the bank doesn’t share this card’s APR'
          : `${formatMoney(outcome.interestTwelveMonths)} interest over the next 12 months`}
      </p>
    </div>
  );
}

export default function CreditCardsPanel({
  cards,
  onPlanPayment,
}: {
  cards: CashFlowCardSummary[];
  onPlanPayment: (accountId: string) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="credit-cards-heading">
      <h3 id="credit-cards-heading" className="text-lg font-semibold text-[#102319]">Credit cards</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5e6b63]">
        What each card owes, how you’ve been paying it, and what paying it off sooner would save. Interest is estimated
        monthly at the card’s purchase APR on any part of a statement left unpaid.
      </p>

      <ul className="mt-5 space-y-5">
        {cards.map(card => (
          <li key={card.accountId} className="rounded-2xl border border-[#102319]/10 bg-[#f3f2e9]/60 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#102319] text-[#d9ff6f]">
                  <CreditCard size={17} aria-hidden="true" />
                </span>
                <div>
                  <h4 className="text-base font-bold text-[#102319]">{cardName(card)}</h4>
                  <p className="text-xs text-[#66736b]">
                    {card.balance === null ? 'Balance not reported' : `${formatMoney(card.balance)} owed`}
                    {' · '}
                    {card.apr === null ? 'APR not shared' : `${card.apr}% APR`}
                  </p>
                  <p className="mt-1 text-sm text-[#5e6b63]">{paceDescription(card)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onPlanPayment(card.accountId)}
                className="min-h-10 shrink-0 self-start rounded-full border border-[#102319]/15 bg-[#fffdf5] px-4 py-2 text-sm font-bold text-[#102319] transition hover:border-[#102319]/30"
              >
                Plan a payment
              </button>
            </div>

            {(card.currentPace || card.withPlans) && (
              <div className={`mt-4 grid gap-3 ${card.currentPace && card.withPlans ? 'md:grid-cols-2' : ''}`}>
                {card.currentPace && (
                  <Outcome title="At your current pace" outcome={card.currentPace} paymentSource={card.paymentSource} tone="muted" />
                )}
                {card.withPlans && (
                  <Outcome title="With your plan" outcome={card.withPlans} paymentSource={card.paymentSource} tone="plan" />
                )}
              </div>
            )}

            {!card.currentPace && (
              <p className="mt-3 text-xs leading-5 text-[#66736b]">
                {card.balance === null
                  ? 'This card’s balance isn’t reported, so it can’t be projected.'
                  : card.withPlans
                    ? 'With no usual payment to go on, only the payments you plan are counted.'
                    : 'Plan a monthly payment to project this card’s balance and interest.'}
              </p>
            )}

            {card.interestSaved && Math.round(card.interestSaved.twelveMonths) !== 0 && (
              <p className={`mt-3 text-sm font-bold ${card.interestSaved.twelveMonths > 0 ? 'text-[#28704d]' : 'text-[#9b4137]'}`}>
                {card.interestSaved.twelveMonths > 0
                  ? `Your plan saves ${formatMoney(card.interestSaved.twelveMonths)} in interest over the next 12 months.`
                  : `Your plan adds ${formatMoney(-card.interestSaved.twelveMonths)} in interest over the next 12 months.`}
              </p>
            )}

            {card.paymentSource === 'other' && (
              <p className="mt-3 text-xs leading-5 text-[#76510f]">
                Payments to this card don’t seem to come from your connected accounts, so they aren’t taken out of your projected cash.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
