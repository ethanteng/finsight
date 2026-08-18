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

  it('groups one asset class into a single bucket regardless of provider casing', () => {
    const portfolio = buildCanonicalInvestmentPortfolio(
      [
        { id: 'plaid-etf', security_id: 'plaid-etf', institution_value: 100, iso_currency_code: 'USD' },
        { id: 'snaptrade-etf', security_id: 'snaptrade-etf', institution_value: 300, iso_currency_code: 'USD' },
        { id: 'plaid-fund', security_id: 'plaid-fund', institution_value: 200, iso_currency_code: 'USD' },
        { id: 'snaptrade-fund', security_id: 'snaptrade-fund', institution_value: 200, iso_currency_code: 'USD' },
        { id: 'undefined-type', security_id: 'undefined-type', institution_value: 200, iso_currency_code: 'USD' },
      ],
      [
        { security_id: 'plaid-etf', type: 'etf' },
        { security_id: 'snaptrade-etf', type: 'ETF' },
        { security_id: 'plaid-fund', type: 'mutual fund' },
        { security_id: 'snaptrade-fund', type: 'Mutual Fund' },
        { security_id: 'undefined-type', type: 'Security type is not defined' },
      ],
      [],
      'USD'
    );

    expect(portfolio.assetAllocation).toEqual([
      { type: 'ETF', value: 400, percentage: 40 },
      { type: 'Mutual Fund', value: 400, percentage: 40 },
      { type: 'Unknown', value: 200, percentage: 20 },
    ]);
  });

  it('falls back to the holding security type when the security record has none', () => {
    const portfolio = buildCanonicalInvestmentPortfolio(
      [
        { id: 'h1', security_id: 'sec-1', institution_value: 100, iso_currency_code: 'USD', security_type: 'cash' },
        { id: 'h2', security_id: 'sec-2', institution_value: 100, iso_currency_code: 'USD', security_type: 'Cash' },
      ],
      [{ security_id: 'sec-1' }, { security_id: 'sec-2', type: null }],
      [],
      'USD'
    );

    expect(portfolio.assetAllocation).toEqual([{ type: 'Cash', value: 200, percentage: 100 }]);
  });

  it('keeps a months-old manual account current while a bank balance goes stale', () => {
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
            // Entered by hand in February and untouched since: it is not stale,
            // it is simply what the user said it was.
            account_id: 'manual-pension',
            source: 'manual',
            type: 'investment',
            subtype: 'pension',
            snapshotTimestamp: '2026-02-07T19:29:10.000Z',
            balance: { current: 44_817.23, iso_currency_code: 'USD' },
          },
        ],
      },
      { computedAt, reportingCurrency: 'USD', balanceMaxAgeMs: 24 * 60 * 60 * 1000 }
    );

    expect(snapshot.quality.staleSourceIds).toEqual([]);
    expect(snapshot.status).toBe('current');
    expect(snapshot.financialOverview.totalInvestments).toBe(44_817.23);
  });

  it('ages a brokerage balance on the investment window, not the cash window', () => {
    const accounts = [
      {
        // SnapTrade stamps the account with the provider's last successful
        // holdings sync, which advances daily at best and not at all over a
        // weekend. Two days old is a correctly-synced brokerage, not a stale one.
        account_id: 'snaptrade-brokerage',
        source: 'snaptrade',
        type: 'investment',
        subtype: 'brokerage',
        snapshotTimestamp: '2026-08-12T12:00:00.000Z',
        balance: { current: 61_400, iso_currency_code: 'USD' },
      },
      {
        account_id: 'checking',
        source: 'plaid',
        type: 'depository',
        subtype: 'checking',
        snapshotTimestamp: '2026-08-14T11:00:00.000Z',
        balance: { current: 10_000, iso_currency_code: 'USD' },
      },
    ];
    const options = {
      computedAt,
      reportingCurrency: 'USD',
      balanceMaxAgeMs: 24 * 60 * 60 * 1000,
      investmentMaxAgeMs: 4 * 24 * 60 * 60 * 1000,
    };

    const snapshot = buildCanonicalSnapshotCore({ accounts }, options);
    expect(snapshot.quality.staleSourceIds).toEqual([]);
    expect(snapshot.status).toBe('current');

    // The brokerage window still expires — it is longer, not absent.
    const longStale = buildCanonicalSnapshotCore(
      {
        accounts: [
          { ...accounts[0], snapshotTimestamp: '2026-08-04T12:00:00.000Z' },
          accounts[1],
        ],
      },
      options
    );
    expect(longStale.quality.staleSourceIds).toEqual(['account:snaptrade-brokerage']);
    expect(longStale.status).toBe('stale');
  });

  it('expires a provider home estimate but not a manual one', () => {
    const stale = { valueMid: 1_200_000, lastUpdated: '2026-06-09T17:13:46.455Z' };
    const accounts = [{
      account_id: 'checking',
      source: 'plaid',
      type: 'depository',
      subtype: 'checking',
      snapshotTimestamp: computedAt,
      balance: { current: 10_000, iso_currency_code: 'USD' },
    }];

    const estimated = buildCanonicalSnapshotCore(
      { accounts, homeValue: { ...stale, isManualOverride: false } },
      { computedAt, reportingCurrency: 'USD' }
    );
    expect(estimated.quality.staleSourceIds).toEqual(['home-value']);
    expect(estimated.status).toBe('stale');

    const manual = buildCanonicalSnapshotCore(
      { accounts, homeValue: { ...stale, isManualOverride: true } },
      { computedAt, reportingCurrency: 'USD' }
    );
    expect(manual.quality.staleSourceIds).toEqual([]);
    expect(manual.status).toBe('current');
    // Same value either way: freshness rules must not change the number.
    expect(manual.financialOverview.homeValue).toBe(1_200_000);
  });

  it('reports bank freshness as asOf, not the date a manual account was edited', () => {
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
            account_id: 'manual-pension',
            source: 'manual',
            type: 'investment',
            subtype: 'pension',
            snapshotTimestamp: '2026-02-07T19:29:10.000Z',
            balance: { current: 44_817.23, iso_currency_code: 'USD' },
          },
        ],
        homeValue: {
          valueMid: 1_200_000,
          lastUpdated: '2026-01-05T00:00:00.000Z',
          isManualOverride: true,
        },
      },
      { computedAt, reportingCurrency: 'USD', balanceMaxAgeMs: 24 * 60 * 60 * 1000 }
    );

    // Both hand-entered values are older than the bank balance, and neither
    // should make the page claim its data is from February.
    expect(snapshot.asOf?.toISOString()).toBe('2026-08-14T11:00:00.000Z');
    expect(snapshot.status).toBe('current');
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
