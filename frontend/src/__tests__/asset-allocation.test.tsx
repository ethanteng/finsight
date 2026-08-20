import React from 'react';
import { render, screen } from '@testing-library/react';
import InvestmentPortfolio from '@/components/InvestmentPortfolio';
import { normalizeAssetType } from '@/lib/asset-class';

jest.mock('recharts', () => ({
  BarChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

describe('normalizeAssetType (frontend)', () => {
  it('maps provider spellings of one asset class to a single label', () => {
    expect(normalizeAssetType('etf')).toBe('ETF');
    expect(normalizeAssetType('ETF')).toBe('ETF');
    expect(normalizeAssetType('mutual fund')).toBe('Mutual Fund');
    expect(normalizeAssetType('Mutual Fund')).toBe('Mutual Fund');
    expect(normalizeAssetType('Common Stock')).toBe('Equity');
    expect(normalizeAssetType('Security type is not defined')).toBe('Unrecognized holdings');
    expect(normalizeAssetType(undefined)).toBe('Unrecognized holdings');
  });
});

describe('InvestmentPortfolio asset allocation', () => {
  it('shows one row per asset class even when the API sends mixed casing', () => {
    render(
      <InvestmentPortfolio
        portfolio={{
          totalValue: 1000,
          assetAllocation: [
            { type: 'etf', value: 400, percentage: 40 },
            { type: 'ETF', value: 200, percentage: 20 },
            { type: 'mutual fund', value: 300, percentage: 30 },
            { type: 'Mutual Fund', value: 100, percentage: 10 },
          ],
          holdingCount: 4,
          securityCount: 4,
        }}
        holdings={[]}
        transactions={[]}
      />
    );

    expect(screen.getAllByText('ETF')).toHaveLength(1);
    expect(screen.getAllByText('Mutual Fund')).toHaveLength(1);
    expect(screen.getByText('$600.00')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });
});
