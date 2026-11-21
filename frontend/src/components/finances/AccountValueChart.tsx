"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AccountValueHistory, FinancesAccount } from '../../types/finances-overview';
import {
  formatCalendarDate,
  formatMoney,
  formatSignedMoney,
} from '../../lib/cash-flow-format';

/**
 * An account's value over time, in its detail view. The series comes from the
 * server (src/services/account-value-history.ts): a connected cash account or
 * card rebuilt from its posted transactions, anything else from the values
 * Linc recorded each time the provider reported it. The caption says which,
 * since the two mean different things -- and a recorded history that has only
 * just started says so instead of drawing a line through one point.
 */

export type AccountValueRange = '1M' | '3M' | '6M' | '1Y' | 'All';
type Point = AccountValueHistory['points'][number];

const RANGE_DAYS: Record<Exclude<AccountValueRange, 'All'>, number> = {
  '1M': 30,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
};
const RANGES: AccountValueRange[] = ['1M', '3M', '6M', '1Y', 'All'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const COLORS = {
  line: '#173c2c',
  up: '#1f6b43',
  down: '#9b4137',
  axis: '#66736b',
  grid: 'rgba(16, 35, 25, 0.11)',
};

function shiftDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

/** The first day a range shows, counted back from the series' last day. */
function rangeStart(points: readonly Point[], range: AccountValueRange): string | null {
  if (points.length === 0 || range === 'All') return null;
  return shiftDays(points[points.length - 1].date, -RANGE_DAYS[range]);
}

export function pointsInRange(points: readonly Point[], range: AccountValueRange): Point[] {
  const start = rangeStart(points, range);
  return start === null ? [...points] : points.filter(point => point.date >= start);
}

/**
 * Ranges worth offering: ones the history reaches past, so each shows less
 * than the whole, and that still hold a line's worth of points. "All" always.
 */
export function availableRanges(points: readonly Point[]): AccountValueRange[] {
  if (points.length === 0) return ['All'];
  const first = points[0].date;
  return RANGES.filter(range => {
    const start = rangeStart(points, range);
    return start === null || (first < start && pointsInRange(points, range).length >= 2);
  });
}

function titleFor(measure: AccountValueHistory['measure']): string {
  if (measure === 'owed') return 'Amount owed over time';
  if (measure === 'balance') return 'Balance over time';
  return 'Value over time';
}

/** How the value moved over the points shown, and whether that was good for the user. */
export function describeChange(
  points: readonly Point[],
  measure: AccountValueHistory['measure']
): { text: string; tone: 'up' | 'down' | 'flat' } | null {
  if (points.length < 2) return null;
  const first = points[0];
  const change = points[points.length - 1].value - first.value;
  const since = `since ${formatCalendarDate(first.date)}`;
  if (Math.round(change) === 0) return { text: `No change ${since}`, tone: 'flat' };
  if (measure === 'owed') {
    // Owing less is the good direction, and "+$500" would not say which way that is.
    return change < 0
      ? { text: `Down ${formatMoney(Math.abs(change))} ${since}`, tone: 'up' }
      : { text: `Up ${formatMoney(change)} ${since}`, tone: 'down' };
  }
  return { text: `${formatSignedMoney(change)} ${since}`, tone: change > 0 ? 'up' : 'down' };
}

/** Where the series came from, said plainly under the chart. */
export function describeSource(
  history: Pick<AccountValueHistory, 'method' | 'points' | 'currency' | 'unconverted'>,
  account: Pick<FinancesAccount, 'institution' | 'source'>
): string {
  const institution = account.institution?.trim() || 'your institution';
  if (history.unconverted) {
    // Not "nothing recorded yet": nothing will be, until Linc converts currencies.
    return `This account's balance isn't reported in ${history.currency}, and Linc doesn't convert currencies, `
      + `so it can't chart this account.`;
  }
  if (history.method === 'transactions') {
    return `Rebuilt from this account's posted transactions, working back from the balance ${institution} reported. `
      + `Pending transactions aren't counted, and the line starts at the earliest transaction Linc has.`;
  }
  const first = history.points[0];
  if (account.source === 'manual') {
    if (history.points.length < 2) {
      return first
        ? `You entered this balance on ${formatCalendarDate(first.date)}. The chart adds a point each time you change it.`
        : 'The chart adds a point each time you change this balance.';
    }
    return `The balance you entered, each time you changed it, since ${formatCalendarDate(first.date)}.`;
  }
  if (history.points.length < 2) {
    return first
      ? `Linc has one recorded value for this account so far, from ${formatCalendarDate(first.date)}. `
        + `The chart fills in as ${institution} reports new values.`
      : `Linc records this account's value each time ${institution} reports it. Nothing has been recorded yet.`;
  }
  return `What ${institution} reported for this account each day Linc recorded it, since ${formatCalendarDate(first.date)}.`;
}

/**
 * A y-axis label as short as it can be while still exact to the dollar:
 * "$18.5K" rather than "$18K" for 18,500. An account's value often moves within
 * a few hundred dollars of five figures, where whole thousands would give every
 * tick the same label.
 */
export function formatAxisMoney(value: number): string {
  const magnitude = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  const [unit, suffix] = magnitude >= 1_000_000 ? [1_000_000, 'M'] : magnitude >= 1_000 ? [1_000, 'K'] : [1, ''];
  const scaled = magnitude / unit;
  for (let decimals = 0; decimals <= 2; decimals += 1) {
    const shown = scaled.toFixed(decimals);
    if (Math.abs(Number(shown) - scaled) * unit < 0.5) return `${sign}$${shown}${suffix}`;
  }
  return formatMoney(value);
}

function tickLabel(date: string, longSpan: boolean): string {
  const [year, month, day] = date.split('-').map(Number);
  return longSpan ? `${MONTHS[month - 1]} ’${String(year).slice(2)}` : `${MONTHS[month - 1]} ${day}`;
}

function ValueTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  label: string;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="space-y-1 rounded-lg border border-[#486657] bg-[#102319] p-3 text-xs text-white shadow-lg">
      <p className="font-bold">{formatCalendarDate(point.date)}</p>
      <p className="flex justify-between gap-6">
        <span className="text-white/70">{label}</span>
        <span className="font-bold tabular-nums">{formatMoney(point.value)}</span>
      </p>
    </div>
  );
}

interface AccountValueChartProps {
  account: FinancesAccount;
  accountId: string;
  revisionId: string;
}

export default function AccountValueChart({ account, accountId, revisionId }: AccountValueChartProps) {
  const [history, setHistory] = useState<AccountValueHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<AccountValueRange>('All');
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(
          `${API_URL}/api/finances/accounts/${encodeURIComponent(accountId)}/history`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) throw new Error('Account history is unavailable');
        const data = await response.json() as AccountValueHistory;
        if (!Array.isArray(data?.points)) throw new Error('Account history is unavailable');
        if (!cancelled) setHistory(data);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [API_URL, accountId, revisionId]);

  const ranges = useMemo(() => availableRanges(history?.points ?? []), [history]);
  const activeRange = ranges.includes(range) ? range : 'All';
  const shown = useMemo(() => pointsInRange(history?.points ?? [], activeRange), [history, activeRange]);

  if (loading) {
    return (
      <section className="mb-6 rounded-lg bg-gray-800 p-4 sm:p-6" aria-busy="true">
        <div className="h-5 w-40 animate-pulse rounded bg-[#102319]/10" />
        <div className="mt-4 h-[200px] animate-pulse rounded-xl bg-[#102319]/5 sm:h-[240px]" />
      </section>
    );
  }
  if (failed || !history) {
    return (
      <section className="mb-6 rounded-lg bg-gray-800 p-4 text-sm text-[#5e6b63] sm:p-6">
        This account&apos;s value history is unavailable right now.
      </section>
    );
  }

  const title = titleFor(history.measure);
  const latest = history.points[history.points.length - 1] ?? null;
  const change = describeChange(shown, history.measure);
  const canChart = shown.length >= 2;
  const longSpan = canChart && daysBetween(shown[0].date, shown[shown.length - 1].date) > 200;
  const values = shown.map(point => point.value);
  const crossesZero = canChart && Math.min(...values) < 0;
  const seriesLabel = history.measure === 'owed' ? 'Owed' : history.measure === 'balance' ? 'Balance' : 'Value';
  const summary = canChart
    ? `${title}: ${formatMoney(shown[0].value)} on ${formatCalendarDate(shown[0].date)} to `
      + `${formatMoney(shown[shown.length - 1].value)} on ${formatCalendarDate(shown[shown.length - 1].date)}.`
    : '';

  return (
    <section className="mb-6 rounded-lg bg-gray-800 p-4 sm:p-6" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[#102319]">{title}</h3>
          {latest && (
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#102319]">{formatMoney(latest.value)}</p>
          )}
          {change && (
            <p
              className="mt-0.5 text-sm font-medium"
              style={{ color: change.tone === 'up' ? COLORS.up : change.tone === 'down' ? COLORS.down : COLORS.axis }}
            >
              {change.text}
            </p>
          )}
        </div>
        {ranges.length > 1 && (
          <div className="flex gap-1 rounded-xl border border-[#102319]/10 bg-[#f3f2e9] p-1" role="group" aria-label="Time range">
            {ranges.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                aria-pressed={activeRange === option}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                  activeRange === option
                    ? 'bg-[#102319] text-white shadow-sm'
                    : 'text-[#5e6b63] hover:bg-white/60 hover:text-[#102319]'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      {canChart ? (
        <div role="img" aria-label={summary} className="mt-4 h-[200px] w-full sm:h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={shown} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="account-value-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.line} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={COLORS.line} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(date: string) => tickLabel(date, longSpan)}
                tickLine={false}
                axisLine={{ stroke: '#ccd1c4' }}
                tick={{ fill: COLORS.axis, fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={formatAxisMoney}
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fill: COLORS.axis, fontSize: 11 }}
              />
              <Tooltip content={<ValueTooltip label={seriesLabel} />} />
              {crossesZero && <ReferenceLine y={0} stroke={COLORS.down} strokeDasharray="4 4" />}
              <Area
                dataKey="value"
                type="linear"
                stroke={COLORS.line}
                strokeWidth={2}
                fill="url(#account-value-fill)"
                dot={shown.length <= 2 ? { r: 3, fill: COLORS.line } : false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-[#5e6b63]">{describeSource(history, account)}</p>
    </section>
  );
}
