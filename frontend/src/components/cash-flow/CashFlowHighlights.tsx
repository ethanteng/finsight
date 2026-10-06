"use client";

import type { CashFlowHighlight, CashFlowHighlightKey, CashFlowReport } from '../../types/cash-flow';
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
 * The parts that add up to the card's headline: what happened so far (only
 * when the headline includes it), the forecast's income and spending before
 * any plans, and what the plans change. Each part is rounded on its own and one
 * part takes the rounding remainder, so the figures shown always sum to the
 * headline shown.
 */
function breakdownLines(highlight: CashFlowHighlight, forecastStart: string): BreakdownLine[] {
  const headline = highlight.projected ?? highlight.remaining;
  if (!headline) return [];
  const lastDay = lastIncludedDay(highlight.endExclusive);
  const forecastFrom = forecastStart > highlight.start ? forecastStart : highlight.start;
  const forecastInWindow = forecastFrom <= lastDay;

  let actual: BreakdownPart | null = null;
  if (highlight.projected && highlight.actualToDate) {
    const actualLast = forecastInWindow ? lastIncludedDay(forecastFrom) : lastDay;
    actual = part('So far', highlight.actualToDate.net, `Actual · ${formatShortRange(highlight.start, actualLast)}`);
  }
  let usual: BreakdownPart[] = [];
  if (forecastInWindow && highlight.remaining) {
    const detail = forecastFrom > highlight.start ? `Forecast · ${formatShortRange(forecastFrom, lastDay)}` : undefined;
    usual = [
      part('Usual income', highlight.remaining.income - highlight.planned.income, detail),
      part('Usual spending', -(highlight.remaining.spending - highlight.planned.spending), detail),
    ];
  }
  const planned = Math.round(highlight.planned.net) !== 0 ? part('Planned events', highlight.planned.net) : null;
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
}: {
  highlight: CashFlowHighlight;
  forecastStart: string;
  coverageStart: string | null;
}) {
  const headline = highlight.projected ?? highlight.remaining;
  const headlineLabel = highlight.projected
    ? (highlight.projected.net < 0 ? 'Expected shortfall' : 'Expected to save')
    : 'Expected for the rest of it';
  const headlineColor = headline && headline.net < 0 ? 'text-[#9b4137]' : 'text-[#102319]';
  const lines = breakdownLines(highlight, forecastStart);

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
        />
      ))}
    </section>
  );
}
