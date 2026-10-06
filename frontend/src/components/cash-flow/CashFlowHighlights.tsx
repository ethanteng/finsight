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

/**
 * The parts that add up to the card's headline: what happened so far (only
 * when the headline includes it), the forecast before any plans, and what the
 * plans change. Each part is rounded and the forecast part takes the rounding
 * remainder, so the figures shown always sum to the headline shown.
 */
function breakdownLines(highlight: CashFlowHighlight, forecastStart: string): BreakdownLine[] {
  const headline = highlight.projected ?? highlight.remaining;
  if (!headline) return [];
  const lastDay = lastIncludedDay(highlight.endExclusive);
  const forecastFrom = forecastStart > highlight.start ? forecastStart : highlight.start;
  const actual = highlight.projected && highlight.actualToDate ? Math.round(highlight.actualToDate.net) : null;
  const planned = Math.round(highlight.planned.net);
  const lines: BreakdownLine[] = [];
  if (actual !== null) {
    const actualLast = forecastFrom <= lastDay ? lastIncludedDay(forecastFrom) : lastDay;
    lines.push({ label: 'So far', detail: `Actual · ${formatShortRange(highlight.start, actualLast)}`, value: actual });
  }
  if (forecastFrom <= lastDay) {
    lines.push({
      label: 'Usual income and spending',
      detail: forecastFrom > highlight.start ? `Forecast · ${formatShortRange(forecastFrom, lastDay)}` : undefined,
      value: Math.round(headline.net) - (actual ?? 0) - planned,
    });
  }
  if (planned !== 0) lines.push({ label: 'Planned events', value: planned });
  return lines;
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
