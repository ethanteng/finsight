"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CashFlowReport } from '../../types/cash-flow';
import {
  formatCalendarDate,
  formatCompactMoney,
  formatMoney,
  periodLabel,
  projectsCardDebt,
  shortPeriodLabel,
} from '../../lib/cash-flow-format';

export interface CashPositionRow {
  key: string;
  shortLabel: string;
  label: string;
  cash: number | null;
  cardDebt: number | null;
}

/** One row per period from the forecast on: the balances at each period's end. */
export function buildPositionRows(report: Pick<CashFlowReport, 'periods' | 'position' | 'granularity'>): CashPositionRow[] {
  return report.periods.flatMap((period, index) => {
    const point = report.position.periods[index];
    if (!point || point.cash === null) return [];
    return [{
      key: period.key,
      shortLabel: shortPeriodLabel(period, report.granularity),
      label: periodLabel(period, report.granularity),
      cash: point.cash,
      cardDebt: point.cardDebt,
    }];
  });
}

const COLORS = {
  cash: '#173c2c',
  cardDebt: '#9b4137',
  axis: '#66736b',
  grid: 'rgba(16, 35, 25, 0.11)',
};

function PositionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CashPositionRow }> }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="min-w-[200px] space-y-1.5 rounded-lg border border-[#486657] bg-[#102319] p-3 text-xs text-white shadow-lg">
      <p className="text-sm font-bold">End of {row.label}</p>
      <p className="flex justify-between gap-6"><span className="text-white/70">Cash</span><span className="font-bold tabular-nums">{row.cash === null ? '—' : formatMoney(row.cash)}</span></p>
      <p className="flex justify-between gap-6"><span className="text-white/70">Owed on cards</span><span className="font-bold tabular-nums">{row.cardDebt === null ? '—' : formatMoney(row.cardDebt)}</span></p>
    </div>
  );
}

export function CashPositionLegend({ hasCards }: { hasCards: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#5e6b63]">
      <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-[#173c2c]" aria-hidden="true" />Cash in checking and savings</span>
      {hasCards && <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 border-t-2 border-dashed border-[#9b4137]" aria-hidden="true" />Owed on credit cards</span>}
    </div>
  );
}

export default function CashPositionChart({ report }: { report: CashFlowReport }) {
  const rows = buildPositionRows(report);
  const hasCards = projectsCardDebt(report);
  const lowPoint = report.position.lowPoint;
  const summary = `Projected cash${hasCards ? ' and credit card balances' : ''} at the end of each ${report.granularity}`
    + (lowPoint ? `, lowest ${formatMoney(lowPoint.cash)} on ${formatCalendarDate(lowPoint.date)}.` : '.');

  return (
    <div role="img" aria-label={summary} className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
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
          <YAxis tickFormatter={formatCompactMoney} tickLine={false} axisLine={false} width={56} tick={{ fill: COLORS.axis, fontSize: 11 }} />
          <Tooltip content={<PositionTooltip />} />
          {rows.some(row => (row.cash ?? 0) < 0) && <ReferenceLine y={0} stroke="#9b4137" strokeDasharray="4 4" />}
          <Line dataKey="cash" name="Cash" type="linear" stroke={COLORS.cash} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.cash }} isAnimationActive={false} />
          {hasCards && (
            <Line dataKey="cardDebt" name="Owed on cards" type="linear" stroke={COLORS.cardDebt} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
