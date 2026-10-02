"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CashFlowGranularity, CashFlowReport } from '../../types/cash-flow';
import {
  formatCompactMoney,
  formatMoney,
  formatSignedMoney,
  periodLabel,
  shortPeriodLabel,
} from '../../lib/cash-flow-format';

export interface CashFlowChartRow {
  key: string;
  shortLabel: string;
  label: string;
  phase: 'past' | 'current' | 'future';
  coverage: 'full' | 'partial' | 'none';
  incomeActual: number | null;
  incomeForecast: number | null;
  spendingActual: number | null;
  spendingForecast: number | null;
  incomeTotal: number | null;
  spendingTotal: number | null;
  net: number | null;
}

/** One row per period. Each bar stacks what happened under what is expected. */
export function buildChartRows(report: Pick<CashFlowReport, 'periods'>, granularity: CashFlowGranularity): CashFlowChartRow[] {
  return report.periods.map(period => ({
    key: period.key,
    shortLabel: shortPeriodLabel(period, granularity),
    label: periodLabel(period, granularity),
    phase: period.phase,
    coverage: period.coverage,
    incomeActual: period.actual?.income ?? null,
    incomeForecast: period.forecast?.income ?? null,
    spendingActual: period.actual?.spending ?? null,
    spendingForecast: period.forecast?.spending ?? null,
    incomeTotal: period.total?.income ?? null,
    spendingTotal: period.total?.spending ?? null,
    net: period.total?.net ?? null,
  }));
}

const COLORS = {
  income: '#2b8f5d',
  incomeForecast: 'rgba(43, 143, 93, 0.28)',
  spending: '#c46a4a',
  spendingForecast: 'rgba(196, 106, 74, 0.28)',
  net: '#102319',
  axis: '#66736b',
  grid: 'rgba(16, 35, 25, 0.11)',
};

function TooltipLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <p className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-white/70">
        {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />}
        {label}
      </span>
      <span className="font-bold tabular-nums">{value}</span>
    </p>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CashFlowChartRow }> }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const parts = (total: number | null, actual: number | null, forecast: number | null) => {
    if (total === null) return 'No data';
    return actual !== null && forecast !== null
      ? `${formatMoney(total)} (${formatMoney(actual)} so far)`
      : formatMoney(total);
  };
  return (
    <div className="min-w-[220px] space-y-1.5 rounded-lg border border-[#486657] bg-[#102319] p-3 text-xs text-white shadow-lg">
      <p className="text-sm font-bold">{row.label}</p>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/55">
        {row.phase === 'past' ? 'Actual' : row.phase === 'future' ? 'Forecast' : 'Actual + forecast'}
        {row.coverage === 'partial' ? ' · partial history' : ''}
      </p>
      <TooltipLine label="Cash in" value={parts(row.incomeTotal, row.incomeActual, row.incomeForecast)} color={COLORS.income} />
      <TooltipLine label="Cash out" value={parts(row.spendingTotal, row.spendingActual, row.spendingForecast)} color={COLORS.spending} />
      {row.net !== null && <TooltipLine label="Net" value={formatSignedMoney(row.net)} />}
    </div>
  );
}

export default function CashFlowChart({ report }: { report: CashFlowReport }) {
  const rows = buildChartRows(report, report.granularity);
  const todayKey = rows.find(row => row.phase !== 'past')?.key;
  const forecastPeriods = rows.filter(row => row.phase !== 'past').length;
  const summary = `Cash in and cash out by ${report.granularity}, ${rows.length - forecastPeriods} periods of history and ${forecastPeriods} forecast. The table below lists every figure.`;

  return (
    <div role="img" aria-label={summary} className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: 0 }} barGap={2}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="key"
            tickFormatter={(key: string) => rows.find(row => row.key === key)?.shortLabel ?? key}
            tickLine={false}
            axisLine={{ stroke: '#ccd1c4' }}
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tickFormatter={formatCompactMoney}
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: COLORS.axis, fontSize: 11 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(16, 35, 25, 0.05)' }} />
          {todayKey && (
            <ReferenceLine
              x={todayKey}
              stroke="#102319"
              strokeDasharray="4 4"
              label={{ value: 'Forecast →', position: 'insideTopLeft', fill: COLORS.axis, fontSize: 11 }}
            />
          )}
          <Bar dataKey="incomeActual" name="Cash in" stackId="in" fill={COLORS.income} isAnimationActive={false} />
          <Bar
            dataKey="incomeForecast"
            name="Cash in (forecast)"
            stackId="in"
            fill={COLORS.incomeForecast}
            stroke={COLORS.income}
            strokeDasharray="3 2"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar dataKey="spendingActual" name="Cash out" stackId="out" fill={COLORS.spending} isAnimationActive={false} />
          <Bar
            dataKey="spendingForecast"
            name="Cash out (forecast)"
            stackId="out"
            fill={COLORS.spendingForecast}
            stroke={COLORS.spending}
            strokeDasharray="3 2"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            dataKey="net"
            name="Net"
            type="linear"
            stroke={COLORS.net}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS.net }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowChartLegend() {
  const item = (label: string, swatch: React.ReactNode) => (
    <span className="inline-flex items-center gap-2">{swatch}{label}</span>
  );
  const box = (fill: string, stroke?: string) => (
    <span
      className="h-3 w-3 rounded-sm"
      style={{ background: fill, border: stroke ? `1px dashed ${stroke}` : undefined }}
      aria-hidden="true"
    />
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#5e6b63]">
      {item('Cash in', box(COLORS.income))}
      {item('Cash out', box(COLORS.spending))}
      {item('Forecast', box('rgba(16, 35, 25, 0.12)', '#66736b'))}
      {item('Net', <span className="h-0.5 w-4 bg-[#102319]" aria-hidden="true" />)}
    </div>
  );
}
