"use client";

import type { CashFlowHighlight, CashFlowHighlightKey, CashFlowReport } from '../../types/cash-flow';
import {
  HIGHLIGHT_LABELS,
  formatCalendarDate,
  formatSignedMoney,
  lastIncludedDay,
} from '../../lib/cash-flow-format';

const CARD_KEYS: CashFlowHighlightKey[] = ['this_month', 'this_quarter', 'next_12_months'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-[#5e6b63]">{label}</span>
      <span className="font-bold tabular-nums text-[#102319]">{value}</span>
    </div>
  );
}

function HighlightCard({ highlight, coverageStart }: { highlight: CashFlowHighlight; coverageStart: string | null }) {
  const headline = highlight.projected ?? highlight.remaining;
  const headlineLabel = highlight.projected
    ? (highlight.projected.net < 0 ? 'Expected shortfall' : 'Expected to save')
    : 'Expected for the rest of it';
  const hasPlanned = Math.round(highlight.planned.net) !== 0;

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
          <p className={`mt-1 text-3xl font-semibold tracking-[-0.04em] tabular-nums ${headline.net < 0 ? 'text-[#9b4137]' : 'text-[#102319]'}`}>
            {formatSignedMoney(headline.net)}
          </p>
          <div className="mt-4 space-y-1.5 border-t border-[#102319]/10 pt-4">
            {highlight.actualToDate && <Row label="So far" value={formatSignedMoney(highlight.actualToDate.net)} />}
            {highlight.actualToDate && highlight.remaining && (
              <Row label="Still expected" value={formatSignedMoney(highlight.remaining.net)} />
            )}
            {hasPlanned && <Row label="From planned events" value={formatSignedMoney(highlight.planned.net)} />}
            {hasPlanned && highlight.projectedWithoutPlanned && (
              <Row label="Without planned events" value={formatSignedMoney(highlight.projectedWithoutPlanned.net)} />
            )}
          </div>
          {highlight.actualCoverage === 'partial' && coverageStart && (
            <p className="mt-3 text-xs leading-5 text-[#76510f]">
              Your history starts {formatCalendarDate(coverageStart)}, so the full period can’t be added up yet.
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
        <HighlightCard key={highlight.key} highlight={highlight} coverageStart={report.coverageStart} />
      ))}
    </section>
  );
}
