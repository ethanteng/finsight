"use client";
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface HistoricalSnapshot {
  computedAt: string;
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
}

interface FinancialMetricsChartProps {
  data: HistoricalSnapshot[];
  timeRange?: '1M' | '3M' | '6M' | '1Y' | 'All';
}

export default function FinancialMetricsChart({ data, timeRange = 'All' }: FinancialMetricsChartProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const formatDateLabel = (date: Date): string => {
    const daysDiff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff < 30) {
      // Show day and month for recent data
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (daysDiff < 365) {
      // Show month and year for medium-term data
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else {
      // Show month and full year for long-term data
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  };

  const filteredData = useMemo(() => {
    if (timeRange === 'All' || !data.length) return data;
    
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeRange) {
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
    }
    
    return data.filter(item => {
      const itemDate = new Date(item.computedAt);
      return itemDate >= cutoff;
    });
  }, [data, timeRange]);

  const chartData = useMemo(() => {
    // Reverse to show oldest first (for proper time progression)
    return [...filteredData].reverse().map(item => ({
      date: new Date(item.computedAt),
      dateLabel: formatDateLabel(new Date(item.computedAt)),
      netWorth: item.netWorth,
      totalCash: item.totalCash,
      totalInvestments: item.totalInvestments,
      totalDebt: item.totalDebt,
      homeValue: item.homeValue ?? 0,
    }));
  }, [filteredData]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No historical data available yet. Historical snapshots will appear after the next daily refresh.
      </div>
    );
  }

  const allValues = [
    ...chartData.map(d => d.netWorth),
    ...chartData.map(d => d.totalCash),
    ...chartData.map(d => d.totalInvestments),
    ...chartData.map(d => d.totalDebt),
    ...chartData.map(d => d.homeValue).filter(v => v > 0),
  ];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const valueRange = maxValue - minValue || 1;

  return (
    <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="dateLabel"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            tickFormatter={formatCurrency}
            domain={[minValue - valueRange * 0.1, maxValue + valueRange * 0.1]}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatCurrency(value), getMetricLabel(name)]}
            labelFormatter={(label) => `Date: ${label}`}
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#fff'
            }}
            itemStyle={{ color: '#fff' }}
            labelStyle={{ color: '#fff' }}
          />
          <Legend
            wrapperStyle={{ color: '#fff' }}
            formatter={getMetricLabel}
          />
          <Line
            type="monotone"
            dataKey="netWorth"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            name="netWorth"
          />
          <Line
            type="monotone"
            dataKey="totalCash"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
            name="totalCash"
          />
          <Line
            type="monotone"
            dataKey="totalInvestments"
            stroke="#8B5CF6"
            strokeWidth={2}
            dot={false}
            name="totalInvestments"
          />
          <Line
            type="monotone"
            dataKey="totalDebt"
            stroke="#EF4444"
            strokeWidth={2}
            dot={false}
            name="totalDebt"
          />
          <Line
            type="monotone"
            dataKey="homeValue"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={false}
            name="homeValue"
          />
        </LineChart>
      </ResponsiveContainer>
  );
}

function getMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    netWorth: 'Net Worth',
    totalCash: 'Total Cash',
    totalInvestments: 'Total Investments',
    totalDebt: 'Total Debt',
    homeValue: 'Home Value',
  };
  return labels[metric] || metric;
}
