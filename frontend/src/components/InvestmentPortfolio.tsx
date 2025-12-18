'use client';

import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Security {
  id: string;
  name: string;
  ticker_symbol?: string;
  type: string;
  close_price?: number;
  close_price_as_of?: string;
  iso_currency_code: string;
}

interface Holding {
  id: string;
  account_id: string;
  security_id: string;
  institution_value: number;
  institution_price: number;
  institution_price_as_of: string;
  cost_basis: number;
  quantity: number;
  iso_currency_code: string;
  security_name?: string;
  security_type?: string;
  ticker_symbol?: string;
  name?: string;
  type?: string;
  value?: number;
  snapTradeData?: {
    open_pnl?: number;
    average_purchase_price?: number;
    account_name?: string;
    account_number?: string;
  };
}

interface InvestmentTransaction {
  id?: string;
  transaction_id?: string;
  account_id: string;
  security_id: string;
  amount: number;
  date: string;
  name?: string;
  security_name?: string;
  security_type?: string;
  ticker_symbol?: string;
  quantity: number;
  type: string;
  iso_currency_code: string;
  snapTradeData?: {
    activity_type?: string;
    description?: string;
    trade_date?: string;
    settlement_date?: string;
    fee?: number;
    account_name?: string;
    account_number?: string;
    institution?: string;
  };
}

interface PortfolioAnalysis {
  totalValue: number;
  assetAllocation: Array<{
    type: string;
    value: number;
    percentage: number;
  }>;
  holdingCount: number;
  securityCount: number;
}

interface ActivityAnalysis {
  totalTransactions: number;
  totalVolume: number;
  activityByType: Record<string, { count: number; totalAmount: number }>;
  averageTransactionSize: number;
}

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
}

interface InvestmentData {
  holdings: Holding[];
  securities: Security[];
  accounts: Account[];
  investment_transactions: unknown[];
  total_investment_transactions: number;
  item: unknown;
  analysis: {
    portfolio: PortfolioAnalysis;
    activity: ActivityAnalysis;
  };
}

interface InvestmentPortfolioProps {
  portfolio: {
    totalValue: number;
    assetAllocation: Array<{
      type: string;
      value: number;
      percentage: number;
    }>;
    holdingCount: number;
    securityCount: number;
  };
  holdings: Holding[];
  transactions: InvestmentTransaction[];
  isDemo?: boolean;
}

export default function InvestmentPortfolio({ portfolio, holdings, transactions }: InvestmentPortfolioProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'holdings' | 'transactions'>('overview');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getAssetTypeIcon = (type: string) => {
    const typeLower = type.toLowerCase();
    if (typeLower.includes('equity') || typeLower.includes('stock')) return '📈';
    if (typeLower.includes('bond') || typeLower.includes('fixed')) return '📊';
    if (typeLower.includes('mutual') || typeLower.includes('fund')) return '🏦';
    if (typeLower.includes('etf')) return '📋';
    if (typeLower.includes('option')) return '⚡';
    if (typeLower.includes('crypto')) return '₿';
    return '💰';
  };

  const getAssetAllocationArray = () => {
    if (!portfolio.assetAllocation) return [];
    
    return portfolio.assetAllocation
      .sort((a, b) => b.value - a.value);
  };

  // Pie chart data for holdings
  const holdingsPieData = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];
    
    const totalValue = holdings.reduce((sum, h) => sum + (h.institution_value || h.value || 0), 0);
    
    return holdings
      .map(holding => ({
        name: holding.security_name || holding.name || 'Unknown Security',
        ticker: holding.ticker_symbol || '',
        value: holding.institution_value || holding.value || 0,
        percentage: totalValue > 0 ? ((holding.institution_value || holding.value || 0) / totalValue) * 100 : 0,
        quantity: holding.quantity || 0,
        price: holding.institution_price || 0,
        holding: holding
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  // Color palette for pie chart
  const COLORS = [
    '#3B82F6', // blue
    '#10B981', // green
    '#8B5CF6', // purple
    '#F59E0B', // orange
    '#EF4444', // red
    '#06B6D4', // cyan
    '#EC4899', // pink
    '#84CC16', // lime
    '#6366F1', // indigo
    '#F97316', // orange-500
  ];

  if (!portfolio) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-gray-400 text-center py-4">
          No investment portfolio data available.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Investment Portfolio</h2>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400">Total Portfolio Value</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(portfolio.totalValue)}</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400">Total Holdings</div>
          <div className="text-2xl font-bold text-white">{portfolio.holdingCount}</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400">Unique Securities</div>
          <div className="text-2xl font-bold text-white">{portfolio.securityCount}</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400">Recent Transactions</div>
          <div className="text-2xl font-bold text-white">
            {transactions?.length || 0}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-700 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'bg-gray-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Portfolio Overview
        </button>
        <button
          onClick={() => setActiveTab('holdings')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'holdings'
              ? 'bg-gray-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Holdings
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'transactions'
              ? 'bg-gray-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Transactions
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Asset Allocation Chart */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">Asset Allocation</h3>
            <div className="space-y-3">
              {getAssetAllocationArray().map((allocation) => (
                <div key={allocation.type} className="flex items-center space-x-3">
                  <div className="text-2xl">{getAssetTypeIcon(allocation.type)}</div>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-white">{allocation.type}</span>
                      <span className="text-gray-400">{formatCurrency(allocation.value)}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${allocation.percentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {allocation.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'holdings' && (
        <div className="space-y-6">
          {holdings && holdings.length > 0 ? (
            <>
              {/* Pie Chart */}
              <div className="bg-gray-700 rounded-lg p-6 border border-gray-600">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={holdingsPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => {
                        const displayName = name.length > 15 ? name.substring(0, 15) + '...' : name;
                        return `${displayName}: ${percentage.toFixed(1)}%`;
                      }}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {holdingsPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string, props: any) => {
                        const data = props.payload;
                        const tooltipLines = [
                          `${formatCurrency(value)} (${data.percentage.toFixed(1)}%)`,
                          data.ticker ? `Ticker: ${data.ticker}` : null,
                          `Qty: ${data.quantity.toLocaleString()}`,
                          data.price > 0 ? `Price: ${formatCurrency(data.price)}/share` : null
                        ].filter(Boolean);
                        return tooltipLines;
                      }}
                      contentStyle={{
                        backgroundColor: '#1F2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Holdings Details List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {holdingsPieData.map((holdingData, index) => {
                  const holding = holdingData.holding;
                  return (
                    <div key={holding.id || holding.security_id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white truncate">
                              {holding.security_name || holding.name || 'Unknown Security'}
                            </div>
                            <div className="text-sm text-gray-400">
                              {holding.security_type || holding.type || 'Unknown Type'}
                              {holding.ticker_symbol && ` • ${holding.ticker_symbol}`}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Qty: {holding.quantity?.toLocaleString() || 'N/A'}
                              {holding.institution_price > 0 && ` • ${formatCurrency(holding.institution_price)}/share`}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-white text-lg">
                            {formatCurrency(holding.institution_value || holding.value || 0)}
                          </div>
                          <div className="text-sm text-gray-400">
                            {holdingData.percentage.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-center py-8">
              No holdings data available
            </div>
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {transactions && transactions.length > 0 ? (
            transactions.map((transaction) => (
              <div key={transaction.id || transaction.transaction_id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="text-2xl">
                      {getAssetTypeIcon(transaction.security_type || transaction.type || 'Unknown')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">
                        {transaction.security_name || transaction.name || 'Unknown Security'}
                      </div>
                      <div className="text-sm text-gray-400">
                        {transaction.snapTradeData?.activity_type || transaction.type} • {transaction.date}
                        {transaction.ticker_symbol && ` • ${transaction.ticker_symbol}`}
                        {transaction.snapTradeData?.account_name && ` • ${transaction.snapTradeData.account_name}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        Quantity: {transaction.quantity?.toLocaleString() || 'N/A'}
                        {transaction.snapTradeData?.description && ` • ${transaction.snapTradeData.description}`}
                        {transaction.snapTradeData?.fee && transaction.snapTradeData.fee > 0 && ` • Fee: ${formatCurrency(transaction.snapTradeData.fee)}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${
                      transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatCurrency(Math.abs(transaction.amount || 0))}
                    </div>
                    <div className="text-sm text-gray-400">
                      {transaction.snapTradeData?.activity_type || transaction.type}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-gray-400 text-center py-8">
              No transaction data available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
