"use client";

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  CashFlowReport,
  CashFlowSpendingCategory,
  CashFlowSpendingCategorySource,
  CashFlowSpendingCategoryTransaction,
} from '../../types/cash-flow';
import { CADENCE_LABELS, formatCalendarDate, formatMoney, roundToTotal } from '../../lib/cash-flow-format';

/** Categories listed before the rest fold into one line. */
const CATEGORIES_SHOWN = 8;
/** Transactions a source lists before "Show all". */
const TRANSACTIONS_SHOWN = 10;
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
  /** The category itself; none for the line the rest fold into. */
  category: CashFlowSpendingCategory | null;
}

/** The bar, amount and share of a row, laid out on the row's grid. */
function RowCells({ row, widest, open }: { row: Row; widest: number; open: boolean | null }) {
  return (
    <>
      <span className="min-w-0 text-[#102319]">{row.label}</span>
      <span className="col-span-4 row-start-2 h-2.5 sm:col-span-1 sm:col-start-2 sm:row-start-1" aria-hidden="true">
        <span
          className="block h-full rounded-r-[4px]"
          style={{ width: `${(row.share / widest) * 100}%`, minWidth: 2, backgroundColor: SPENDING_COLOR }}
        />
      </span>
      <span className="text-right font-semibold tabular-nums text-[#102319]">{row.dollars > 0 ? formatMoney(row.dollars) : '<$1'}</span>
      <span className="text-right tabular-nums text-[#66736b]">{row.percent > 0 ? `${row.percent}%` : '<1%'}</span>
      <span className="flex justify-end text-[#66736b]" aria-hidden="true">
        {open !== null && <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />}
      </span>
    </>
  );
}

// On a phone the bar runs under the label and figures; wider, each category is one line.
const ROW_GRID = 'grid w-full grid-cols-[minmax(0,1fr)_auto_2.75rem_0.875rem] items-baseline gap-x-3 gap-y-1.5 text-left text-sm sm:grid-cols-[12rem_minmax(0,1fr)_5rem_2.75rem_0.875rem] sm:items-center';

function TransactionList({ transactions, count, withLabels }: {
  transactions: readonly CashFlowSpendingCategoryTransaction[];
  count: number;
  /** A bill's transactions are all one payee, so they need no label. */
  withLabels: boolean;
}) {
  const [all, setAll] = useState(false);
  if (transactions.length === 0) return null;
  const shown = all ? transactions : transactions.slice(0, TRANSACTIONS_SHOWN);
  return (
    <div className="mt-2">
      <ul className="space-y-1 border-l-2 border-[#102319]/10 pl-3">
        {shown.map(transaction => (
          <li key={transaction.id} className="flex items-baseline gap-3 text-xs">
            <span className="w-[5.75rem] shrink-0 tabular-nums text-[#5e6b63]">{formatCalendarDate(transaction.date)}</span>
            <span className="min-w-0 flex-1 break-words text-[#5e6b63]">{withLabels ? transaction.label : ''}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[#102319]">{formatMoney(transaction.amount, true)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 pl-3 text-xs">
        {transactions.length > TRANSACTIONS_SHOWN && (
          <button type="button" onClick={() => setAll(!all)} className="font-bold text-[#102319] underline">
            {all
              ? `Show the latest ${TRANSACTIONS_SHOWN}`
              : `Show ${count > transactions.length ? 'the latest' : 'all'} ${transactions.length}`}
          </button>
        )}
        {count > shown.length && (all || transactions.length <= TRANSACTIONS_SHOWN) && (
          <span className="text-[#66736b]">Showing the latest {shown.length} of {count}.</span>
        )}
      </div>
    </div>
  );
}

function SourceHeading({ title, detail, dollars }: { title: string; detail?: string; dollars: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="min-w-0">
        <span className="font-semibold text-[#102319]">{title}</span>
        {detail && <span className="text-[#5e6b63]"> · {detail}</span>}
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-[#102319]">{formatMoney(dollars)} a month</span>
    </div>
  );
}

function Source({ source, dollars }: { source: CashFlowSpendingCategorySource; dollars: number }) {
  switch (source.kind) {
    case 'bill':
      return (
        <div>
          <SourceHeading
            title={source.label}
            detail={`regular bill, ${formatMoney(source.amount, true)} ${CADENCE_LABELS[source.cadence].toLowerCase()}`}
            dollars={dollars}
          />
          <TransactionList transactions={source.transactions} count={source.transactionCount} withLabels={false} />
        </div>
      );
    case 'typical': {
      const count = source.transactionCount === 1 ? '1 transaction' : `${source.transactionCount} transactions`;
      return (
        <div>
          <SourceHeading title="Typical spending" dollars={dollars} />
          <p className="mt-0.5 text-xs leading-5 text-[#5e6b63]">
            {source.transactionCount > 0
              ? `${count} from ${formatCalendarDate(source.from)} to ${formatCalendarDate(source.through)} add up to ${formatMoney(source.total, true)}.`
              : `Your typical pace from ${formatCalendarDate(source.from)} to ${formatCalendarDate(source.through)}.`}
          </p>
          <TransactionList transactions={source.transactions} count={source.transactionCount} withLabels />
        </div>
      );
    }
    case 'projected_interest':
      return (
        <div>
          <SourceHeading title="Projected card interest" dollars={dollars} />
          <p className="mt-0.5 text-xs leading-5 text-[#5e6b63]">
            What your card balances are expected to run up at your usual payment pace, averaged over the next 12
            months. It hasn’t been charged yet, so no transactions are behind it.
          </p>
        </div>
      );
  }
}

/** What a category's month is made of, each part with the transactions behind it. */
function CategoryDetails({ id, category, dollars }: { id: string; category: CashFlowSpendingCategory; dollars: number }) {
  // The parts add up to the dollars the row shows.
  const sourceDollars = roundToTotal(category.sources.map(source => source.monthly), dollars);
  return (
    <div id={id} className="mt-2 mb-1 rounded-xl bg-[#f3f2e9] p-4">
      {/* Kept narrow so a wide screen doesn't pull the amounts away from what they are. */}
      <div className="max-w-3xl space-y-4">
        {category.sources.map((source, index) => (
          <Source key={source.kind === 'bill' ? source.streamId : source.kind} source={source} dollars={sourceDollars[index]} />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({ row, widest, open, onToggle, detailsId }: {
  row: Row;
  widest: number;
  open: boolean;
  onToggle: () => void;
  detailsId: string;
}) {
  if (!row.category) {
    return (
      <li className={`${ROW_GRID} py-1`}>
        <RowCells row={row} widest={widest} open={null} />
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        className={`${ROW_GRID} -mx-2 rounded-lg px-2 py-1 hover:bg-[#f3f2e9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#102319]`}
      >
        <RowCells row={row} widest={widest} open={open} />
      </button>
      {open && <CategoryDetails id={detailsId} category={row.category} dollars={row.dollars} />}
    </li>
  );
}

/** The expected month's usual spending by category, as a ranked bar list; each category opens on what it is made of. */
export default function UsualSpendingBreakdown({ report }: { report: CashFlowReport }) {
  const [showAll, setShowAll] = useState(false);
  const [openLabel, setOpenLabel] = useState<string | null>(null);
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
  const listed: Array<{ label: string; monthly: number; category: CashFlowSpendingCategory | null }> = folds && !showAll
    ? [
      ...usual.categories.slice(0, CATEGORIES_SHOWN).map(category => ({ ...category, category })),
      { label: `${rest.length} other categories`, monthly: rest.reduce((sum, category) => sum + category.monthly, 0), category: null },
    ]
    : usual.categories.map(category => ({ ...category, category }));
  // Rounded on their own, the dollars and percents would rarely add up to the
  // month and to 100%, so the lines listed are rounded to those totals together.
  const exactTotal = listed.reduce((sum, line) => sum + line.monthly, 0);
  const dollars = roundToTotal(listed.map(line => line.monthly), usual.monthly);
  const percents = roundToTotal(listed.map(line => (line.monthly / exactTotal) * 100), 100);
  const shown: Row[] = listed.map((line, index) => ({
    label: line.label,
    dollars: dollars[index],
    percent: percents[index],
    share: line.monthly / exactTotal,
    category: line.category,
  }));
  const widest = Math.max(...shown.map(row => row.share));

  return (
    <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="usual-spending-heading">
      {heading}
      <p className="mt-1 text-xs text-[#66736b]">
        A typical month before planned events: {formatMoney(Math.round(usual.monthly))}. Regular bills count at their
        monthly rate, everything else at your typical pace. Choose a category to see the transactions behind it.
      </p>
      <ol className="mt-5 space-y-2" aria-label="Usual spending by category, largest first">
        {shown.map((row, index) => (
          <CategoryRow
            key={row.label}
            row={row}
            widest={widest}
            open={row.category !== null && openLabel === row.label}
            onToggle={() => setOpenLabel(openLabel === row.label ? null : row.label)}
            detailsId={`usual-spending-category-${index}`}
          />
        ))}
      </ol>
      {folds && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-4 text-xs font-bold text-[#102319] underline">
          {showAll ? `Show the top ${CATEGORIES_SHOWN}` : `Show all ${usual.categories.length} categories`}
        </button>
      )}
    </section>
  );
}
