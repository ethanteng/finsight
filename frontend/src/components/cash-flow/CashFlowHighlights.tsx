"use client";

import type {
  CashFlowHighlight,
  CashFlowHighlightKey,
  CashFlowPlannedEventSummary,
  CashFlowReport,
} from '../../types/cash-flow';
import {
  HIGHLIGHT_LABELS,
  formatCalendarDate,
  formatShortRange,
  formatSignedMoney,
  lastIncludedDay,
} from '../../lib/cash-flow-format';

const CARD_KEYS: CashFlowHighlightKey[] = ['this_month', 'this_quarter', 'next_12_months'];

interface BreakdownLine {
  label: string;
  detail?: string;
  /** Whole dollars, already rounded. */
  value: number;
}

/** A breakdown line while it is built, with the figure it was rounded from. */
type BreakdownPart = BreakdownLine & { exact: number };

function part(label: string, exact: number, detail?: string): BreakdownPart {
  return { label, detail, exact, value: Math.round(exact) };
}

/**
 * What the plans' net is made of, since it can be far smaller than the plans
 * themselves: "Card interest saved · card payments count as $0". Moving money
 * between the user's own accounts is neither income nor spending, so a $3,000
 * transfer adds nothing and a card payoff adds only the interest it saves.
 */
function plannedDetail(highlight: CashFlowHighlight, events: readonly CashFlowPlannedEventSummary[]): string | undefined {
  const components = highlight.remaining?.components;
  const parts: string[] = [];
  if (components) {
    // The plans' spending is what they plan to spend plus the card interest they change.
    const interest = highlight.planned.spending - components.plannedSpending;
    if (Math.round(components.plannedIncome) !== 0) parts.push('planned income');
    if (Math.round(components.plannedSpending) !== 0) parts.push('planned spending');
    if (Math.round(interest) !== 0) parts.push(interest < 0 ? 'card interest saved' : 'added card interest');
  }
  const inWindow = (kind: CashFlowPlannedEventSummary['kind']) => events.some(
    event => event.kind === kind && event.nextDate !== null && event.nextDate < highlight.endExclusive
  );
  const moves = [inWindow('transfer') && 'transfers', inWindow('card_payment') && 'card payments'].filter(Boolean);
  const pieces = [
    parts.length > 0 && parts.join(', '),
    moves.length > 0 && `${moves.join(' and ')} count as $0`,
  ].filter((piece): piece is string => Boolean(piece));
  if (pieces.length === 0) return undefined;
  const detail = pieces.join(' · ');
  return detail.charAt(0).toUpperCase() + detail.slice(1);
}

/**
 * The parts that add up to the card's headline: the net so far (only when the
 * headline includes it), the forecast's income and spending before any plans,
 * and the net the plans change. Each part is rounded on its own and one part
 * takes the rounding remainder, so the figures shown always sum to the
 * headline shown.
 */
function breakdownLines(
  highlight: CashFlowHighlight,
  forecastStart: string,
  events: readonly CashFlowPlannedEventSummary[]
): BreakdownLine[] {
  const headline = highlight.projected ?? highlight.remaining;
  if (!headline) return [];
  const lastDay = lastIncludedDay(highlight.endExclusive);
  const forecastFrom = forecastStart > highlight.start ? forecastStart : highlight.start;
  const forecastInWindow = forecastFrom <= lastDay;

  let actual: BreakdownPart | null = null;
  if (highlight.projected && highlight.actualToDate) {
    const actualLast = forecastInWindow ? lastIncludedDay(forecastFrom) : lastDay;
    actual = part('Net so far', highlight.actualToDate.net, `Actual · ${formatShortRange(highlight.start, actualLast)}`);
  }
  let usual: BreakdownPart[] = [];
  if (forecastInWindow && highlight.remaining) {
    const detail = forecastFrom > highlight.start ? `Forecast · ${formatShortRange(forecastFrom, lastDay)}` : undefined;
    usual = [
      part('Usual income', highlight.remaining.income - highlight.planned.income, detail),
      part('Usual spending', -(highlight.remaining.spending - highlight.planned.spending), detail),
    ];
  }
  // Shown when the plans change the net, or when one falls in the window and
  // changes nothing, so a transfer doesn't seem to have gone missing.
  const plannedNote = forecastInWindow ? plannedDetail(highlight, events) : undefined;
  const planned = Math.round(highlight.planned.net) !== 0 || plannedNote
    ? part('Net from planned events', highlight.planned.net, plannedNote)
    : null;
  const parts = [actual, ...usual, planned].filter((p): p is BreakdownPart => p !== null);

  // An estimate takes the remainder before a fact: the larger usual part, then
  // the plans, then what was observed. A line showing $0 takes it only when
  // every line does, so an empty side doesn't turn into a stray dollar.
  const remainder = Math.round(headline.net) - parts.reduce((sum, p) => sum + p.value, 0);
  if (remainder !== 0) {
    const byMagnitude = [...usual].sort((a, b) => Math.abs(b.exact) - Math.abs(a.exact));
    const candidates = [...byMagnitude, planned, actual].filter((p): p is BreakdownPart => p !== null);
    const target = candidates.find(p => p.value !== 0) ?? candidates[0];
    if (target) target.value += remainder;
  }
  return parts.map(({ label, detail, value }) => ({ label, detail, value }));
}

function Line({ label, detail, value }: BreakdownLine) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-[#5e6b63]">
        {label}
        {detail && <span className="block text-xs text-[#66736b]">{detail}</span>}
      </dt>
      <dd className="font-semibold tabular-nums text-[#102319]">{formatSignedMoney(value)}</dd>
    </div>
  );
}

function HighlightCard({
  highlight,
  forecastStart,
  coverageStart,
  events,
}: {
  highlight: CashFlowHighlight;
  forecastStart: string;
  coverageStart: string | null;
  events: readonly CashFlowPlannedEventSummary[];
}) {
  const headline = highlight.projected ?? highlight.remaining;
  const headlineLabel = highlight.projected
    ? (highlight.projected.net < 0 ? 'Expected shortfall' : 'Expected to save')
    : 'Expected for the rest of it';
  const headlineColor = headline && headline.net < 0 ? 'text-[#9b4137]' : 'text-[#102319]';
  const lines = breakdownLines(highlight, forecastStart, events);

  return (
    <article className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-extrabold text-[#102319]">{HIGHLIGHT_LABELS[highlight.key]}</h3>
        <p className="text-xs text-[#66736b]">
          {formatCalendarDate(highlight.start, false)} – {formatCalendarDate(lastIncludedDay(highlight.endExclusive))}
        </p>
      </header>

      {headline ? (
        <>
          <p className="mt-4 text-xs font-semibold text-[#66736b]">{headlineLabel}</p>
          <p className={`mt-1 text-3xl font-semibold tracking-[-0.04em] tabular-nums ${headlineColor}`}>
            {formatSignedMoney(headline.net)}
          </p>
          {/* One part is just the headline again, so there is nothing to break down. */}
          {lines.length > 1 && (
            <dl className="mt-4 space-y-2 border-t border-[#102319]/10 pt-4">
              {lines.map(line => <Line key={line.label} {...line} />)}
              <div className="flex items-baseline justify-between gap-4 border-t border-[#102319]/10 pt-2 text-sm">
                <dt className="font-semibold text-[#102319]">{headlineLabel}</dt>
                <dd className={`font-bold tabular-nums ${headlineColor}`}>{formatSignedMoney(headline.net)}</dd>
              </div>
            </dl>
          )}
          {highlight.actualCoverage === 'partial' && coverageStart && (
            <p className="mt-3 text-xs leading-5 text-[#76510f]">
              Your history starts {formatCalendarDate(coverageStart)}, so the full period can’t be added up yet.
              {highlight.actualToDate && ` Since then: ${formatSignedMoney(highlight.actualToDate.net)}.`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm leading-6 text-[#5e6b63]">No forecast yet.</p>
      )}
    </article>
  );
}

export default function CashFlowHighlights({ report }: { report: CashFlowReport }) {
  const cards = CARD_KEYS
    .map(key => report.highlights.find(highlight => highlight.key === key))
    .filter((highlight): highlight is CashFlowHighlight => Boolean(highlight));
  return (
    <section aria-label="Cash flow at a glance" className="grid gap-4 md:grid-cols-3">
      {cards.map(highlight => (
        <HighlightCard
          key={highlight.key}
          highlight={highlight}
          forecastStart={report.forecastStart}
          coverageStart={report.coverageStart}
          events={report.plannedEvents}
        />
      ))}
    </section>
  );
}
