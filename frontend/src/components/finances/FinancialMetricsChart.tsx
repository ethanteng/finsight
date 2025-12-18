"use client";
import { useMemo, useState } from 'react';
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
  const [viewMode, setViewMode] = useState<'assets' | 'debt'>('assets');
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
        totalDebt: item.totalDebt, // Positive value for debt chart
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

  // Calculate domain based on view mode
  const assetsValues = [
    ...chartData.map(d => d.netWorth),
    ...chartData.map(d => d.totalCash),
    ...chartData.map(d => d.totalInvestments),
    ...chartData.map(d => d.homeValue),
    ...chartData.map(d => d.assets),
  ];
  const debtValues = chartData.map(d => d.totalDebt);
  
  const assetsMax = Math.max(...assetsValues);
  const debtMax = Math.max(...debtValues);
  
  // Calculate domain with padding
  const padding = 0.1; // 10% padding
  const domainMax = viewMode === 'assets' 
    ? assetsMax * (1 + padding)
    : debtMax * (1 + padding);
  const domainMin = 0; // Always start at 0

  return (
    <div className="space-y-4">
      {/* Toggle Switch */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setViewMode('assets')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'assets'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Assets & Net Worth
        </button>
        <button
          onClick={() => setViewMode('debt')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'debt'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Debt
        </button>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <ReferenceLine y={0} stroke="#6B7280" strokeWidth={2} />
          <XAxis
            dataKey="dateLabel"
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={0}
            tick={{ fill: '#9CA3AF' }}
          />
          <YAxis
            stroke="#9CA3AF"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => formatCurrency(value)}
            domain={[domainMin, domainMax]}
            allowDataOverflow={false}
            tick={{ fill: '#9CA3AF' }}
            type="number"
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              // Only show homeValue in tooltip if it's greater than 0
              if (name === 'homeValue' && value === 0) {
                return null;
              }
              return [formatCurrency(value), getMetricLabel(name)];
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
              return getMetricLabel(value);
            }}
          />
          {viewMode === 'assets' ? (
            <>
              {/* Assets view: Stacked bars for assets + Net Worth line */}
              <Bar dataKey="totalCash" stackId="assets" fill="#10B981" name="totalCash" />
              <Bar dataKey="totalInvestments" stackId="assets" fill="#8B5CF6" name="totalInvestments" />
              <Bar 
                dataKey="homeValue" 
                stackId="assets" 
                fill="#F59E0B" 
                name="homeValue"
                minPointSize={0}
              />
              {/* Net Worth line */}
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="#3B82F6"
                strokeWidth={3}
                dot={false}
                name="netWorth"
                isAnimationActive={false}
              />
            </>
          ) : (
            <>
              {/* Debt view: Single bar chart for debt */}
              <Bar dataKey="totalDebt" fill="#EF4444" name="totalDebt" />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
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
