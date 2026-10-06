"use client";

import { useState } from 'react';
import type { CashFlowReport } from '../../types/cash-flow';
import { formatMoney, roundToTotal } from '../../lib/cash-flow-format';

/** Categories listed before the rest fold into one line. */
const CATEGORIES_SHOWN = 8;
/** The spending series' color in the cash flow chart, so spending looks the same everywhere. */
const SPENDING_COLOR = '#c46a4a';

interface Row {
  label: string;
  /** Whole dollars; the rows add up to the month's total. */
  dollars: number;
  /** Whole percent; the rows add up to 100. */
  percent: number;
  /** Exact share of the month, for the bar. */
  share: number;
}

function CategoryRow({ row, widest }: { row: Row; widest: number }) {
  // On a phone the bar runs under the label and figures; wider, each category is one line.
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_2.75rem] items-baseline gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)_5rem_2.75rem] sm:items-center">
      <span className="min-w-0 text-[#102319]">{row.label}</span>
      <span className="col-span-3 row-start-2 h-2.5 sm:col-span-1 sm:col-start-2 sm:row-start-1" aria-hidden="true">
        <span
          className="block h-full rounded-r-[4px]"
          style={{ width: `${(row.share / widest) * 100}%`, minWidth: 2, backgroundColor: SPENDING_COLOR }}
        />
      </span>
      <span className="text-right font-semibold tabular-nums text-[#102319]">{row.dollars > 0 ? formatMoney(row.dollars) : '<$1'}</span>
      <span className="text-right tabular-nums text-[#66736b]">{row.percent > 0 ? `${row.percent}%` : '<1%'}</span>
    </li>
  );
}

/** The expected month's usual spending by category, as a ranked bar list. */
export default function UsualSpendingBreakdown({ report }: { report: CashFlowReport }) {
  const [showAll, setShowAll] = useState(false);
  if (!report.forecast.available) return null;

  const heading = (
    <h3 id="usual-spending-heading" className="text-lg font-semibold text-[#102319]">Where your usual spending goes</h3>
  );
  const override = report.baseline.monthlyExpenseOverride;
  if (report.baseline.spendingSource === 'override' && override !== null) {
    return (
      <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="usual-spending-heading">
        {heading}
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5e6b63]">
          Your spending is set to {formatMoney(override)} a month on the Finances page. That figure doesn’t say what
          it’s spent on, so there’s no breakdown by category.
        </p>
      </section>
    );
  }

  const usual = report.usualSpending;
  if (!usual || usual.categories.length === 0) return null;

  // Folding a single category into "1 other category" would hide it for nothing.
  const folds = usual.categories.length > CATEGORIES_SHOWN + 1;
  const rest = usual.categories.slice(CATEGORIES_SHOWN);
  const listed = folds && !showAll
    ? [
      ...usual.categories.slice(0, CATEGORIES_SHOWN),
      { label: `${rest.length} other categories`, monthly: rest.reduce((sum, category) => sum + category.monthly, 0) },
    ]
    : usual.categories;
  // Rounded on their own, the dollars and percents would rarely add up to the
  // month and to 100%, so the lines listed are rounded to those totals together.
  const exactTotal = listed.reduce((sum, category) => sum + category.monthly, 0);
  const dollars = roundToTotal(listed.map(category => category.monthly), usual.monthly);
  const percents = roundToTotal(listed.map(category => (category.monthly / exactTotal) * 100), 100);
  const shown: Row[] = listed.map((category, index) => ({
    label: category.label,
    dollars: dollars[index],
    percent: percents[index],
    share: category.monthly / exactTotal,
  }));
  const widest = Math.max(...shown.map(row => row.share));

  return (
    <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="usual-spending-heading">
      {heading}
      <p className="mt-1 text-xs text-[#66736b]">
        A typical month before planned events: {formatMoney(Math.round(usual.monthly))}. Regular bills count at their
        monthly rate, everything else at your typical pace.
      </p>
      <ol className="mt-5 space-y-3" aria-label="Usual spending by category, largest first">
        {shown.map(row => <CategoryRow key={row.label} row={row} widest={widest} />)}
      </ol>
      {folds && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-4 text-xs font-bold text-[#102319] underline">
          {showAll ? `Show the top ${CATEGORIES_SHOWN}` : `Show all ${usual.categories.length} categories`}
        </button>
      )}
    </section>
  );
}
