/**
 * Patterns across runs of the public retirement calculator.
 *
 * Built as a pure function over rows so it is testable without a database,
 * and so the admin endpoint stays a query plus a call.
 *
 * The distributions are deliberately banded rather than averaged. A mean
 * portfolio across a landing page's visitors is dominated by whoever typed
 * the most zeroes; what the page actually needs to know is how many people
 * arrive at each scale, and which of those bands the model serves badly.
 */

export interface QuickPlanRunRow {
  outcome: string;
  rejectedField: string | null;
  assumedFields: string[];
  missingFields: string[];
  currentAge: number | null;
  retirementAge: number | null;
  investableAssets: number | null;
  annualSpending: number | null;
  annualContributions: number | null;
  socialSecurityAnnual: number | null;
  socialSecurityStartAge: number | null;
  allocation: string | null;
  survivalRate: number | null;
  durationMs: number | null;
  cached: boolean;
  createdAt: Date;
}

export interface Band {
  label: string;
  count: number;
  share: number;
}

export interface QuickPlanReport {
  generatedAt: string;
  windowDays: number;
  totals: {
    runs: number;
    /** A full verdict: the visitor gave both a portfolio and a spending level. */
    answeredWithVerdict: number;
    /** Answered in rates, because one of those two was blank. */
    answeredWithRates: number;
    /** Refused, with the field named below. */
    rejected: number;
    /** Share of submissions that got any answer at all. This is the headline. */
    answerRate: number;
    cachedShare: number;
    medianDurationMs: number | null;
  };
  /** Which figure the model refused, most frequent first. */
  rejectionsByField: Band[];
  /** Which figure was left blank, most frequent first. */
  blanksByField: Band[];
  /** What the model had to assume, most frequent first. */
  assumptionsByField: Band[];
  distributions: {
    currentAge: Band[];
    retirementAge: Band[];
    investableAssets: Band[];
    annualSpending: Band[];
    socialSecurityAnnual: Band[];
    allocation: Band[];
    /** Only runs that produced a verdict; the others claimed none. */
    survivalRate: Band[];
  };
  daily: Array<{ date: string; runs: number; rejected: number; answerRate: number }>;
}

function band(edges: number[], format: (low: number, high: number | null) => string) {
  return (value: number): string => {
    for (let index = 0; index < edges.length; index += 1) {
      if (value < edges[index]) {
        return format(index === 0 ? Number.NEGATIVE_INFINITY : edges[index - 1], edges[index]);
      }
    }
    return format(edges[edges.length - 1], null);
  };
}

const money = (value: number) =>
  value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
    : `$${Math.round(value / 1_000)}k`;

const moneyBand = (edges: number[]) =>
  band(edges, (low, high) => {
    if (low === Number.NEGATIVE_INFINITY) return `under ${money(high!)}`;
    return high === null ? `${money(low)}+` : `${money(low)}–${money(high)}`;
  });

const ageBand = band([30, 40, 50, 55, 60, 65, 70, 75], (low, high) => {
  if (low === Number.NEGATIVE_INFINITY) return `under ${high}`;
  return high === null ? `${low}+` : `${low}–${high - 1}`;
});

const ASSET_EDGES = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000];
const SPENDING_EDGES = [30_000, 50_000, 75_000, 100_000, 150_000, 250_000];
const BENEFIT_EDGES = [1, 20_000, 30_000, 40_000, 60_000];

/** Bands in the order the edges define them, so a chart reads low to high. */
function tally(values: string[], order?: string[]): Band[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const total = values.length;
  const entries = [...counts.entries()];

  entries.sort((left, right) => {
    if (order) {
      const leftIndex = order.indexOf(left[0]);
      const rightIndex = order.indexOf(right[0]);
      if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    }
    return right[1] - left[1];
  });

  return entries.map(([label, count]) => ({
    label,
    count,
    share: total === 0 ? 0 : count / total,
  }));
}

function bandsFor(
  rows: QuickPlanRunRow[],
  read: (row: QuickPlanRunRow) => number | null,
  toBand: (value: number) => string,
  order: string[]
): Band[] {
  const labels = rows
    .map(read)
    .filter((value): value is number => value !== null)
    .map(toBand);
  return tally(labels, order);
}

/** Every label the band function can produce, low to high, so empty bands sort correctly. */
function labelOrder(edges: number[], toBand: (value: number) => string): string[] {
  const probes = [edges[0] - 1, ...edges];
  return [...new Set(probes.map(toBand))];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function buildQuickPlanReport(rows: QuickPlanRunRow[], windowDays: number): QuickPlanReport {
  const rejected = rows.filter((row) => row.outcome === 'rejected');
  const withVerdict = rows.filter((row) => row.outcome === 'plan');
  const withRates = rows.filter((row) => row.outcome === 'rates');
  const answered = rows.length - rejected.length;

  const byDate = new Map<string, { runs: number; rejected: number }>();
  for (const row of rows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    const entry = byDate.get(date) ?? { runs: 0, rejected: 0 };
    entry.runs += 1;
    if (row.outcome === 'rejected') entry.rejected += 1;
    byDate.set(date, entry);
  }

  const survivalBand = band([0.5, 0.7, 0.8, 0.9, 0.95], (low, high) => {
    if (low === Number.NEGATIVE_INFINITY) return `under ${Math.round(high! * 100)}%`;
    return high === null ? `${Math.round(low * 100)}%+` : `${Math.round(low * 100)}–${Math.round(high * 100)}%`;
  });

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    totals: {
      runs: rows.length,
      answeredWithVerdict: withVerdict.length,
      answeredWithRates: withRates.length,
      rejected: rejected.length,
      answerRate: rows.length === 0 ? 0 : answered / rows.length,
      cachedShare: rows.length === 0 ? 0 : rows.filter((row) => row.cached).length / rows.length,
      medianDurationMs: median(
        rows.map((row) => row.durationMs).filter((value): value is number => value !== null)
      ),
    },
    rejectionsByField: tally(
      rejected.map((row) => row.rejectedField ?? 'unknown')
    ),
    blanksByField: tally(rows.flatMap((row) => row.missingFields)),
    assumptionsByField: tally(rows.flatMap((row) => row.assumedFields)),
    distributions: {
      currentAge: bandsFor(rows, (row) => row.currentAge, ageBand, labelOrder([30, 40, 50, 55, 60, 65, 70, 75], ageBand)),
      retirementAge: bandsFor(rows, (row) => row.retirementAge, ageBand, labelOrder([30, 40, 50, 55, 60, 65, 70, 75], ageBand)),
      investableAssets: bandsFor(rows, (row) => row.investableAssets, moneyBand(ASSET_EDGES), labelOrder(ASSET_EDGES, moneyBand(ASSET_EDGES))),
      annualSpending: bandsFor(rows, (row) => row.annualSpending, moneyBand(SPENDING_EDGES), labelOrder(SPENDING_EDGES, moneyBand(SPENDING_EDGES))),
      socialSecurityAnnual: bandsFor(rows, (row) => row.socialSecurityAnnual, moneyBand(BENEFIT_EDGES), labelOrder(BENEFIT_EDGES, moneyBand(BENEFIT_EDGES))),
      allocation: tally(
        rows.map((row) => row.allocation).filter((value): value is string => value !== null),
        ['conservative', 'balanced', 'growth']
      ),
      survivalRate: bandsFor(
        withVerdict,
        (row) => row.survivalRate,
        survivalBand,
        labelOrder([0.5, 0.7, 0.8, 0.9, 0.95], survivalBand)
      ),
    },
    daily: [...byDate.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, entry]) => ({
        date,
        runs: entry.runs,
        rejected: entry.rejected,
        answerRate: entry.runs === 0 ? 0 : (entry.runs - entry.rejected) / entry.runs,
      })),
  };
}
