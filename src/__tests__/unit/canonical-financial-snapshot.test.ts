import { describe, expect, it } from '@jest/globals';
import {
  buildCanonicalInvestmentPortfolio,
  buildCanonicalSnapshotCore,
} from '../../services/canonical-financial-snapshot';

const computedAt = new Date('2026-08-14T12:00:00.000Z');

describe('canonical financial snapshot', () => {
  it('computes overview values once from known USD inputs', () => {
    const snapshot = buildCanonicalSnapshotCore(
      {
        accounts: [
          {
            account_id: 'checking',
            source: 'plaid',
            type: 'depository',
            subtype: 'checking',
            snapshotTimestamp: '2026-08-14T11:00:00.000Z',
            balance: { current: 10_000, iso_currency_code: 'USD' },
          },
          {
            account_id: 'credit',
            source: 'plaid',
            type: 'credit',
            subtype: 'credit card',
            snapshotTimestamp: '2026-08-14T11:00:00.000Z',
            balance: { current: -2_000, iso_currency_code: 'USD' },
          },
          {
            account_id: 'manual-ira',
            source: 'manual',
            type: 'investment',
            subtype: 'ira',
            snapshotTimestamp: '2026-08-14T10:00:00.000Z',
            balance: { current: 5_000, iso_currency_code: 'USD' },
          },
        ],
        investments: {
          holdings: [
            {
              id: 'holding-1',
              security_id: 'security-1',
              institution_value: 20_000,
              institution_price_as_of: '2026-08-14T09:00:00.000Z',
              iso_currency_code: 'USD',
            },
          ],
          securities: [{ security_id: 'security-1', type: 'Equity' }],
        },
        homeValue: {
          valueMid: 300_000,
          lastUpdated: '2026-08-14T08:00:00.000Z',
        },
      },
      { computedAt }
    );

    expect(snapshot.status).toBe('current');
    expect(snapshot.asOf).toEqual(new Date('2026-08-14T08:00:00.000Z'));
    expect(snapshot.financialOverview).toMatchObject({
      totalCash: 10_000,
      totalInvestments: 25_000,
      homeValue: 300_000,
      totalDebt: 2_000,
      totalAssets: 335_000,
      totalLiabilities: 2_000,
      netWorth: 333_000,
    });
    expect(snapshot.investmentPortfolio.assetAllocation).toEqual([
      { type: 'Equity', value: 20_000, percentage: 80 },
      { type: 'Manual Investments', value: 5_000, percentage: 20 },
    ]);
  });

  it('preserves a known zero and never substitutes a home-value range bound', () => {
    const zeroHome = buildCanonicalSnapshotCore(
      {
        accounts: [{
          account_id: 'checking',
          source: 'plaid',
          type: 'depository',
          subtype: 'checking',
          snapshotTimestamp: computedAt,
          balance: { current: 0, iso_currency_code: 'USD' },
        }],
        homeValue: { valueMid: 0, lastUpdated: computedAt },
      },
      { computedAt }
    );
    expect(zeroHome.financialOverview.totalCash).toBe(0);
    expect(zeroHome.financialOverview.homeValue).toBe(0);
    expect(zeroHome.financialOverview.netWorth).toBe(0);

    const unknownHome = buildCanonicalSnapshotCore(
      {
        accounts: [{
          account_id: 'checking',
          source: 'plaid',
          type: 'depository',
          subtype: 'checking',
          snapshotTimestamp: computedAt,
          balance: { current: 0, iso_currency_code: 'USD' },
        }],
        homeValue: {
          valueMid: null,
          lastUpdated: computedAt,
          valueLow: 250_000,
          valueHigh: 350_000,
        } as never,
      },
      { computedAt }
    );
    expect(unknownHome.financialOverview.homeValue).toBeNull();
    expect(unknownHome.financialOverview.netWorth).toBe(0);
  });

  it('marks old source observations stale without changing their as-of time', () => {
    const snapshot = buildCanonicalSnapshotCore(
      {
        accounts: [{
          account_id: 'checking',
          source: 'plaid',
          type: 'depository',
          subtype: 'checking',
          snapshotTimestamp: '2026-08-12T12:00:00.000Z',
          balance: { current: 500, iso_currency_code: 'USD' },
        }],
      },
      { computedAt, balanceMaxAgeMs: 24 * 60 * 60 * 1000 }
    );

    expect(snapshot.status).toBe('stale');
    expect(snapshot.asOf).toEqual(new Date('2026-08-12T12:00:00.000Z'));
    expect(snapshot.quality.staleSourceIds).toEqual(['account:checking']);
  });

  it('marks required unknown values partial while an absent optional home value does not', () => {
    const partial = buildCanonicalSnapshotCore(
      {
        accounts: [{
          account_id: 'unknown',
          source: 'plaid',
          type: 'other',
          subtype: 'other',
          snapshotTimestamp: computedAt,
          balance: null,
        }],
      },
      { computedAt }
    );
    expect(partial.status).toBe('partial');
    expect(partial.quality.requiredUnavailableSourceIds).toEqual(
      expect.arrayContaining(['account:unknown:classification', 'account:unknown:balance'])
    );

    const noHome = buildCanonicalSnapshotCore(
      {
        accounts: [{
          account_id: 'checking',
          source: 'plaid',
          type: 'depository',
          subtype: 'checking',
          snapshotTimestamp: computedAt,
          balance: { current: 100, iso_currency_code: 'USD' },
        }],
      },
      { computedAt }
    );
    expect(noHome.status).toBe('current');
    expect(noHome.quality.unavailableSourceIds).toContain('home-value');
  });

  it('excludes unconverted and unavailable investment values instead of silently summing them', () => {
    const portfolio = buildCanonicalInvestmentPortfolio(
      [
        { id: 'usd', security_id: 'usd-security', institution_value: 100, iso_currency_code: 'USD' },
        { id: 'eur', security_id: 'eur-security', institution_value: 200, iso_currency_code: 'EUR' },
        { id: 'missing', security_id: 'missing-security', institution_value: null, iso_currency_code: 'USD' },
      ],
      [],
      [],
      'USD'
    );

    expect(portfolio.totalValue).toBe(100);
    expect(portfolio.currencyMismatchIds).toEqual(['holding:eur']);
    expect(portfolio.unavailableValueIds).toEqual(['holding:missing']);
  });

  it('does not assume a missing source currency is USD', () => {
    const snapshot = buildCanonicalSnapshotCore(
      {
        accounts: [{
          account_id: 'unknown-currency',
          source: 'plaid',
          type: 'depository',
          subtype: 'checking',
          snapshotTimestamp: computedAt,
          balance: { current: 1_000 },
        }],
      },
      { computedAt, reportingCurrency: 'USD' }
    );

    expect(snapshot.financialOverview.totalCash).toBe(0);
    expect(snapshot.status).toBe('partial');
    expect(snapshot.quality.requiredUnavailableSourceIds).toContain(
      'account:unknown-currency:currency'
    );
  });
});
