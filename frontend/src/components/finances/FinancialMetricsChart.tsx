"use client";
import { useMemo, useState } from 'react';
// Import adapter FIRST before Chart.js imports
import 'chartjs-adapter-date-fns';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
  TooltipItem,
  LineController,
  BarController,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { historyPointDisplayDate } from '../../lib/canonical-financial-history';

// Register Chart.js components
// ChartJS.register is idempotent and safe to call multiple times
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
  LineController,
  BarController
);

export interface HistoricalSnapshot {
  computedAt: string;
  observationDate?: string | null;
  timeZone?: string | null;
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

  // Filter data based on time range
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
      const itemDate = historyPointDisplayDate(item);
      return itemDate >= cutoff;
    });
  }, [data, timeRange]);

  // Prepare chart data for Chart.js
  const chartData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;

    // Sort data by date (oldest first)
    const sortedData = [...filteredData].sort((a, b) => 
      new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime()
    );

    // Prepare data points with dates normalized to start of day
    const dataPoints = sortedData.map(item => {
      const date = historyPointDisplayDate(item);
      // Normalize to start of day (midnight) to group by day
      date.setHours(0, 0, 0, 0);
      return {
        x: date.getTime(),
        netWorth: Number(item.netWorth) || 0,
        totalCash: Number(item.totalCash) || 0,
        totalInvestments: Number(item.totalInvestments) || 0,
        totalDebt: Number(item.totalDebt) || 0,
        homeValue: item.homeValue != null ? Number(item.homeValue) : 0,
      };
    });

    if (viewMode === 'assets') {
      // Assets & Net Worth view: Stacked area for assets + line for net worth
      return {
        datasets: [
          // Total Cash (bottom layer)
          {
            label: 'Total Cash',
            data: dataPoints.map(d => ({ x: d.x, y: d.totalCash })),
            backgroundColor: 'rgba(201, 242, 223, 0.82)',
            borderColor: '#82B79D',
            borderWidth: 1,
            fill: true,
            stack: 'assets',
            order: 2,
          },
          // Total Investments (middle layer)
          {
            label: 'Total Investments',
            data: dataPoints.map(d => ({ x: d.x, y: d.totalInvestments })),
            backgroundColor: 'rgba(198, 219, 255, 0.72)',
            borderColor: '#91ADDA',
            borderWidth: 1,
            fill: true,
            stack: 'assets',
            order: 2,
          },
          // Home Value (top layer)
          {
            label: 'Home Value',
            data: dataPoints.map(d => ({ x: d.x, y: d.homeValue })),
            backgroundColor: 'rgba(223, 230, 212, 0.86)',
            borderColor: '#A9B7A4',
            borderWidth: 1,
            fill: true,
            stack: 'assets',
            order: 2,
          },
          // Net Worth line (overlay) - Most prominent as it's the key metric
          {
            label: 'Net Worth',
            data: dataPoints.map(d => ({ x: d.x, y: d.netWorth })),
            borderColor: '#173C2C',
            backgroundColor: 'transparent',
            borderWidth: 3,
            fill: false,
            type: 'line' as const,
            pointRadius: 0,
            pointHoverRadius: 6, // Larger hover area
            tension: 0.1, // Slight curve for smoother appearance
            order: 1,
          },
        ],
      };
    } else {
      // Debt view: Single line/bar for debt
      return {
        datasets: [
          {
            label: 'Total Debt',
            data: dataPoints.map(d => ({ x: d.x, y: d.totalDebt })),
            backgroundColor: 'rgba(184, 74, 61, 0.14)',
            borderColor: '#9B4137',
            borderWidth: 2,
            fill: true,
            type: 'line' as const,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
        ],
      };
    }
  }, [filteredData, viewMode]);

  // Calculate Y-axis domain
  const yAxisMax = useMemo(() => {
    if (!chartData) return 1000;
    
    const allValues: number[] = [];
    chartData.datasets.forEach(dataset => {
      if (Array.isArray(dataset.data)) {
        dataset.data.forEach((point: { x: number; y: number }) => {
          if (point.y !== undefined && point.y !== null) {
            allValues.push(point.y);
          }
        });
      }
    });
    
    if (allValues.length === 0) return 1000;
    const max = Math.max(...allValues);
    return max > 0 ? max * 1.1 : 1000; // 10% padding
  }, [chartData]);

  // Chart options
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#66736B',
          usePointStyle: true,
          padding: 15,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        backgroundColor: '#102319',
        borderColor: '#486657',
        borderWidth: 1,
        padding: 12,
        titleColor: '#fff',
        bodyColor: '#fff',
        callbacks: {
          label: (context: TooltipItem<'line'>) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            // Don't show homeValue if it's 0 or null
            if (label === 'Home Value' && (value === 0 || value === null)) {
              return undefined; // Return undefined instead of null
            }
            // Handle null values
            if (value === null || value === undefined) {
              return `${label}: $0`;
            }
            return `${label}: ${formatCurrency(value)}`;
          },
          title: (context: TooltipItem<'line'>[]) => {
            const xValue = context[0].parsed.x;
            if (xValue === null || xValue === undefined) {
              return 'Unknown date';
            }
            const date = new Date(xValue);
            const daysDiff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysDiff < 30) {
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } else if (daysDiff < 365) {
              return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            } else {
              return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
          displayFormats: {
            day: 'MMM d',
            month: 'MMM yyyy',
            year: 'yyyy',
          },
        },
        grid: {
          color: 'rgba(16, 35, 25, 0.11)',
          drawBorder: false,
        },
        ticks: {
          color: '#66736B',
          font: {
            size: 12,
          },
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        beginAtZero: true,
        max: yAxisMax,
        grid: {
          color: 'rgba(16, 35, 25, 0.11)',
          drawBorder: false,
        },
        ticks: {
          color: '#66736B',
          font: {
            size: 12,
          },
          callback: (value: string | number) => formatCurrency(typeof value === 'number' ? value : parseFloat(value)),
        },
      },
    },
  }), [yAxisMax]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No historical data available yet. Historical snapshots will appear after the next daily refresh.
      </div>
    );
  }

  if (!chartData || filteredData.length === 0) {
    return (
      <div className="space-y-4">
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
        <div className="flex items-center justify-center h-64 text-gray-400">
          No chart data available for the selected time range.
        </div>
      </div>
    );
  }

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
      <div style={{ height: '400px', width: '100%' }}>
        <Chart type="line" data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
