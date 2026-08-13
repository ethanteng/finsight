"use client";
import { useMemo, useCallback } from 'react';

interface Transaction {
  id?: string;
  transaction_id?: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  category?: string[] | string;
  pending?: boolean;
}

interface Snapshot {
  computedAt: string;
  financialOverview: {
    netWorth: number;
    totalCash: number;
    totalInvestments: number;
    totalDebt: number;
    homeValue: number | null;
  };
  transactions?: Transaction[];
  transactionsSummary?: {
    byMonth: Record<string, { income: number; expense: number }>;
    byCategory: Record<string, number>;
  };
}

interface TrendChartProps {
  type: 'netWorth' | 'spending';
  snapshot: Snapshot;
  timeRange: '1M' | '3M' | '6M' | '1Y' | 'All';
  onTimeRangeChange: (range: '1M' | '3M' | '6M' | '1Y' | 'All') => void;
}

export default function TrendChart({
  type,
  snapshot,
  timeRange,
  onTimeRangeChange
}: TrendChartProps) {
  const getCutoffDate = useCallback((range: '1M' | '3M' | '6M' | '1Y' | 'All'): Date => {
    const now = new Date();
    const cutoff = new Date();
    
    switch (range) {
      case '1M':
        cutoff.setMonth(now.getMonth() - 1);
        break;
      case '3M':
        cutoff.setMonth(now.getMonth() - 3);
        break;
      case '6M':
        cutoff.setMonth(now.getMonth() - 6);
        break;
      case '1Y':
        cutoff.setFullYear(now.getFullYear() - 1);
        break;
      case 'All':
        cutoff.setFullYear(2000); // Far back enough
        break;
    }
    
    return cutoff;
  }, []);

  const chartData = useMemo(() => {
    if (type === 'spending' && snapshot.transactionsSummary?.byMonth) {
      const monthKeys = Object.keys(snapshot.transactionsSummary.byMonth).sort();
      const cutoffDate = getCutoffDate(timeRange);
      const filteredMonths = monthKeys.filter(monthKey => {
        const [year, monthNum] = monthKey.split('-').map(Number);
        const monthDate = new Date(year, monthNum - 1);
        return monthDate >= cutoffDate;
      });

      return filteredMonths.map(monthKey => {
        const data = snapshot.transactionsSummary!.byMonth[monthKey];
        return {
          date: monthKey,
          value: data.expense,
          income: data.income
        };
      });
    }

    if (type === 'netWorth' && snapshot.transactions) {
      // Calculate net worth over time from transactions
      const transactions = snapshot.transactions || [];
      const cutoffDate = getCutoffDate(timeRange);
      const filteredTransactions = transactions.filter((t: Transaction) => {
        const txDate = new Date(t.date);
        return txDate >= cutoffDate;
      });

      // Group by month and calculate cumulative net worth
      const monthlyData: Record<string, { income: number; expense: number }> = {};
      filteredTransactions.forEach((t: Transaction) => {
        const date = new Date(t.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { income: 0, expense: 0 };
        }
        if (t.amount < 0) {
          monthlyData[monthKey].income += Math.abs(t.amount);
        } else {
          monthlyData[monthKey].expense += t.amount;
        }
      });

      const monthKeys = Object.keys(monthlyData).sort();
      let runningNetWorth = snapshot.financialOverview.netWorth;
      
      // Work backwards to get starting point
      monthKeys.forEach(monthKey => {
        const data = monthlyData[monthKey];
        runningNetWorth -= (data.income - data.expense);
      });

      // Build forward
      const result = monthKeys.map(monthKey => {
        const data = monthlyData[monthKey];
        runningNetWorth += (data.income - data.expense);
        return {
          date: monthKey,
          value: runningNetWorth
        };
      });

      // If no historical data, show current net worth as single point
      if (result.length === 0) {
        return [{
          date: new Date().toISOString().slice(0, 7),
          value: snapshot.financialOverview.netWorth
        }];
      }

      return result;
    }

    return [];
  }, [type, snapshot, timeRange, getCutoffDate]);

  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          No data available for the selected time range
        </div>
      );
    }

    const values = chartData.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;
    const padding = 40;
    const width = 600;
    const height = 200;

    const points = chartData.map((d, i) => {
      const x = padding + (i / Math.max(chartData.length - 1, 1)) * (width - 2 * padding);
      const y = padding + (height - 2 * padding) * (1 - (d.value - minValue) / range);
      return { x, y, ...d };
    });

    const pathData = points.length > 0 
      ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      : '';

    const areaPath = points.length > 0
      ? `${pathData} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`
      : '';

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding + (height - 2 * padding) * (1 - ratio);
          const value = minValue + range * ratio;
          return (
            <g key={ratio}>
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="#D6DBD1"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={padding - 10}
                y={y + 4}
                fill="#66736B"
                fontSize="10"
                textAnchor="end"
              >
                {formatCurrency(value)}
              </text>
            </g>
          );
        })}

        {/* Area */}
        <path
          d={areaPath}
          fill={type === 'netWorth' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)'}
        />

        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke={type === 'netWorth' ? '#173C2C' : '#9B4137'}
          strokeWidth="2"
        />

        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill={type === 'netWorth' ? '#173C2C' : '#9B4137'}
          />
        ))}

        {/* X-axis labels */}
        {points.length > 0 && points.filter((_, i) => i % Math.max(Math.ceil(points.length / 5), 1) === 0 || i === points.length - 1).map((p, i) => {
          const dateLabel = formatMonthLabel(p.date);
          return (
            <text
              key={i}
              x={p.x}
              y={height - padding + 20}
              fill="#66736B"
              fontSize="10"
              textAnchor="middle"
            >
              {dateLabel}
            </text>
          );
        })}
      </svg>
    );
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          {type === 'netWorth' ? 'Net Worth Trend' : 'Spending Trend'}
        </h3>
        <select
          value={timeRange}
          onChange={(e) => {
            const value = e.target.value as '1M' | '3M' | '6M' | '1Y' | 'All';
            onTimeRangeChange(value);
          }}
          className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
        >
          <option value="1M">1 Month</option>
          <option value="3M">3 Months</option>
          <option value="6M">6 Months</option>
          <option value="1Y">1 Year</option>
          <option value="All">All Time</option>
        </select>
      </div>
      {renderChart()}
    </div>
  );
}
