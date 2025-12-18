"use client";
import { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

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
    return [...filteredData].reverse().map(item => {
      // Ensure homeValue is always a number (use 0 if null)
      const homeValue = item.homeValue != null ? item.homeValue : 0;
      
      return {
        date: new Date(item.computedAt),
        dateLabel: formatDateLabel(new Date(item.computedAt)),
        netWorth: item.netWorth,
        totalCash: item.totalCash,
        totalInvestments: item.totalInvestments,
        totalDebt: -Math.abs(item.totalDebt), // Negative for debt to show below zero
        homeValue: homeValue, // Always include homeValue, even if 0
        // Calculate stacked assets (cash + investments + home value)
        assets: item.totalCash + item.totalInvestments + homeValue,
      };
    });
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
    ...chartData.map(d => d.homeValue),
    ...chartData.map(d => d.assets),
    ...chartData.map(d => Math.abs(d.totalDebt)),
  ];
  const minValue = Math.min(...chartData.map(d => d.totalDebt)); // Most negative (debt)
  const maxValue = Math.max(...allValues);
  
  // Ensure Y-axis starts at 0 and extends both above and below
  // Add padding: 10% above max, 10% below min (but ensure 0 is included)
  const yAxisMin = Math.min(0, minValue * 1.1);
  const yAxisMax = maxValue * 1.1;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <ReferenceLine y={0} stroke="#6B7280" strokeWidth={2} strokeDasharray="0" />
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
          tickFormatter={(value) => formatCurrency(Math.abs(value))}
          domain={[yAxisMin, yAxisMax]}
          allowDataOverflow={false}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            // Handle negative debt values
            const displayValue = name === 'totalDebt' ? Math.abs(value) : value;
            // Only show homeValue in tooltip if it's greater than 0
            if (name === 'homeValue' && displayValue === 0) {
              return null;
            }
            return [formatCurrency(displayValue), getMetricLabel(name)];
          }}
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
          formatter={(value: string) => {
            if (value === 'assets') return null; // Hide assets from legend
            return getMetricLabel(value);
          }}
        />
        {/* Stacked bars - assets above zero, debt below zero */}
        {/* Order matters for stacking: Cash first (bottom), then Investments, then Home Value (top) */}
        <Bar dataKey="totalCash" stackId="assets" fill="#10B981" name="totalCash" />
        <Bar dataKey="totalInvestments" stackId="assets" fill="#8B5CF6" name="totalInvestments" />
        <Bar 
          dataKey="homeValue" 
          stackId="assets" 
          fill="#F59E0B" 
          name="homeValue"
          minPointSize={0}
        />
        {/* Debt bar (negative, uses same stackId to appear as part of same stack but below zero) */}
        <Bar dataKey="totalDebt" stackId="assets" fill="#EF4444" name="totalDebt" />
        {/* Net Worth line */}
        <Line
          type="monotone"
          dataKey="netWorth"
          stroke="#3B82F6"
          strokeWidth={3}
          dot={false}
          name="netWorth"
        />
      </ComposedChart>
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
