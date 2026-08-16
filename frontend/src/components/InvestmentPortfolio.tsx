'use client';

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { normalizeAssetType } from '../lib/asset-class';
import { normalizeLabel } from '../lib/label-normalization';

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
  institution_value: number | null;
  institution_price: number | null;
  institution_price_as_of: string;
  cost_basis: number | null;
  quantity: number | null;
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

    // Defensive merge: if a producer still sends the same asset class under
    // different spellings ("etf" and "ETF"), show one row instead of two.
    const merged = new Map<string, { type: string; value: number; percentage: number }>();
    portfolio.assetAllocation.forEach(allocation => {
      const type = normalizeAssetType(allocation.type);
      const existing = merged.get(type);
      if (existing) {
        existing.value += allocation.value;
        existing.percentage += allocation.percentage;
      } else {
        merged.set(type, { type, value: allocation.value, percentage: allocation.percentage });
      }
    });

    return Array.from(merged.values()).sort((a, b) => b.value - a.value);
  };

  // Bar chart data for holdings
  const holdingsBarData = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];

    const knownValue = (holding: Holding): number | null => {
      if (typeof holding.institution_value === 'number' && Number.isFinite(holding.institution_value)) {
        return holding.institution_value;
      }
      return typeof holding.value === 'number' && Number.isFinite(holding.value)
        ? holding.value
        : null;
    };
    const totalValue = holdings.reduce((sum, holding) => sum + (knownValue(holding) ?? 0), 0);

    return holdings
      .map(holding => {
        const fullName = holding.security_name || holding.name || 'Unknown Security';
        // Use ticker if available, otherwise use first 10 chars of name as fallback
        const ticker = holding.ticker_symbol || fullName.substring(0, 10);
        const value = knownValue(holding);
        return {
          name: fullName,
          ticker: ticker,
          value,
          percentage: totalValue > 0 && value !== null ? (value / totalValue) * 100 : 0,
          quantity: holding.quantity,
          price: holding.institution_price,
          holding: holding
        };
      })
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  }, [holdings]);

  // A restrained tonal scale keeps dense holdings data aligned with the brand.
  const COLORS = [
    '#397052',
    '#477D5E',
    '#568A6B',
    '#659678',
    '#75A285',
    '#86AE92',
    '#98BAA0',
    '#AAC6AE',
    '#BCD2BD',
    '#CEDDCC',
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
        <div className="rounded-xl border border-[#102319]/10 bg-[#f3f2e9] p-4">
          <div className="text-sm text-gray-400">Total Portfolio Value</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(portfolio.totalValue)}</div>
        </div>
        <div className="rounded-xl border border-[#102319]/10 bg-[#f3f2e9] p-4">
          <div className="text-sm text-gray-400">Total Holdings</div>
          <div className="text-2xl font-bold text-white">{portfolio.holdingCount}</div>
        </div>
        <div className="rounded-xl border border-[#102319]/10 bg-[#f3f2e9] p-4">
          <div className="text-sm text-gray-400">Unique Securities</div>
          <div className="text-2xl font-bold text-white">{portfolio.securityCount}</div>
        </div>
        <div className="rounded-xl border border-[#102319]/10 bg-[#f3f2e9] p-4">
          <div className="text-sm text-gray-400">Recent Transactions</div>
          <div className="text-2xl font-bold text-white">
            {transactions?.length || 0}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6 flex space-x-1 rounded-xl border border-[#102319]/10 bg-[#f3f2e9] p-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'bg-[#102319] text-white shadow-sm'
              : 'text-[#5e6b63] hover:bg-white/60 hover:text-[#102319]'
          }`}
        >
          Portfolio Overview
        </button>
        <button
          onClick={() => setActiveTab('holdings')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'holdings'
              ? 'bg-[#102319] text-white shadow-sm'
              : 'text-[#5e6b63] hover:bg-white/60 hover:text-[#102319]'
          }`}
        >
          Holdings
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'transactions'
              ? 'bg-[#102319] text-white shadow-sm'
              : 'text-[#5e6b63] hover:bg-white/60 hover:text-[#102319]'
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
                <div key={allocation.type} className="flex items-center space-x-3 rounded-xl border border-[#102319]/10 bg-[#f8f7ef] px-4 py-3">
                  <div className="text-2xl">{getAssetTypeIcon(allocation.type)}</div>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-white">{allocation.type}</span>
                      <span className="text-gray-400">{formatCurrency(allocation.value)}</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#dfe4da]">
                      <div
                        className="h-2 rounded-full bg-[#397052] transition-all duration-300"
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
              {/* Horizontal Bar Chart */}
              <div className="rounded-2xl border border-[#102319]/12 bg-[#fffdf5] p-6">
                <ResponsiveContainer width="100%" height={Math.min(500, holdingsBarData.length * 40)}>
                  <BarChart
                    data={holdingsBarData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 90, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#D6DBD1" />
                    <XAxis
                      type="number"
                      stroke="#66736B"
                      style={{ fontSize: '12px' }}
                      tickFormatter={formatCurrency}
                    />
                    <YAxis
                      type="category"
                      dataKey="ticker"
                      stroke="#66736B"
                      style={{ fontSize: '12px' }}
                      width={80}
                      tick={{ fill: '#66736B' }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string, props: { payload?: { percentage: number; ticker?: string; quantity: number; price: number; name: string } }) => {
                        const data = props.payload;
                        if (!data) return [`${formatCurrency(value)}`, name];
                        const tooltipLines = [
                          `${formatCurrency(value)} (${data.percentage.toFixed(1)}%)`,
                          data.ticker ? `Ticker: ${data.ticker}` : null,
                          `Qty: ${data.quantity.toLocaleString()}`,
                          data.price > 0 ? `Price: ${formatCurrency(data.price)}/share` : null
                        ].filter(Boolean);
                        return tooltipLines;
                      }}
                      labelFormatter={(label) => `Holding: ${label}`}
                      contentStyle={{
                        backgroundColor: '#102319',
                        border: '1px solid #486657',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                      itemStyle={{ color: '#fff' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#397052"
                      background={{ fill: '#e3e7de' }}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Holdings Details List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {holdingsBarData.map((holdingData, index) => {
                  const holding = holdingData.holding;
                  return (
                    <div key={holding.id || holding.security_id} className="rounded-xl border border-[#102319]/10 bg-[#f8f7ef] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <div
                            className="w-4 h-4 rounded flex-shrink-0"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white truncate">
                              {holding.security_name || holding.name || 'Unknown Security'}
                            </div>
                            <div className="text-sm text-gray-400">
                              {normalizeAssetType(holding.security_type || holding.type)}
                              {holding.ticker_symbol && ` • ${holding.ticker_symbol}`}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Qty: {holding.quantity?.toLocaleString() || 'N/A'}
                              {holding.institution_price !== null && holding.institution_price > 0 && ` • ${formatCurrency(holding.institution_price)}/share`}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-white text-lg">
                            {holdingData.value === null ? 'Value unavailable' : formatCurrency(holdingData.value)}
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
              <div key={transaction.id || transaction.transaction_id} className="rounded-xl border border-[#102319]/10 bg-[#f8f7ef] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="text-2xl">
                      {getAssetTypeIcon(normalizeAssetType(transaction.security_type || transaction.type))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">
                        {transaction.security_name || transaction.name || 'Unknown Security'}
                      </div>
                      <div className="text-sm text-gray-400">
                        {normalizeLabel(transaction.snapTradeData?.activity_type || transaction.type)} • {transaction.date}
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
                      {normalizeLabel(transaction.snapTradeData?.activity_type || transaction.type)}
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
