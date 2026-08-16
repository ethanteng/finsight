import {
  CANONICAL_TRANSACTION_TYPES,
  CORE_METRIC_DEFINITIONS,
  accountIdentityKey,
  averageMonthlyCashFlow,
  computeFinancialOverview,
  evaluateSnapshotQuality,
  isCanonicalTransactionType,
  newestExpiringSourceAsOf,
  summarizeCashFlow,
  type CanonicalTransaction,
} from '../../domain/financial-truth';

const baseTransaction = (overrides: Partial<CanonicalTransaction>): CanonicalTransaction => ({
  id: 'transaction-1',
  accountKey: 'user-1:plaid:item-1:account-1',
  effectiveDate: '2026-05-15T12:00:00.000Z',
  type: 'expense',
  sourceAmount: 100,
  cashFlowAmount: -100,
  currency: 'USD',
  category: 'General',
  pending: false,
  ...overrides,
});

describe('financial truth contract', () => {
  describe('account identity', () => {
    it('scopes the provider account ID to owner, source, and connection', () => {
      const first = accountIdentityKey({
        ownerId: 'user-1',
        source: 'plaid',
        sourceConnectionId: 'item-1',
        sourceAccountId: 'account-1',
      });
      const secondConnection = accountIdentityKey({
        ownerId: 'user-1',
        source: 'plaid',
        sourceConnectionId: 'item-2',
        sourceAccountId: 'account-1',
      });
      const secondProvider = accountIdentityKey({
        ownerId: 'user-1',
        source: 'snaptrade',
        sourceConnectionId: 'connection-1',
        sourceAccountId: 'account-1',
      });

      expect(new Set([first, secondConnection, secondProvider]).size).toBe(3);
    });

    it('does not allow incomplete source identity', () => {
      expect(() =>
        accountIdentityKey({
          ownerId: 'user-1',
          source: 'plaid',
          sourceConnectionId: ' ',
          sourceAccountId: 'account-1',
        })
      ).toThrow('Account identity fields must be non-empty strings');
    });
  });

  describe('transaction semantics', () => {
    it('uses classification rather than sign and excludes transfers, trades, and pending activity', () => {
      const transactions: CanonicalTransaction[] = [
        baseTransaction({ id: 'salary', type: 'income', sourceAmount: -2500, cashFlowAmount: 2500 }),
        baseTransaction({ id: 'groceries', category: 'Groceries', sourceAmount: 100, cashFlowAmount: -100 }),
        baseTransaction({ id: 'fee', type: 'fee', category: 'Fees', sourceAmount: 5, cashFlowAmount: -5 }),
        baseTransaction({ id: 'refund', type: 'refund', category: 'Groceries', sourceAmount: -20, cashFlowAmount: 20 }),
        baseTransaction({ id: 'transfer-in', type: 'transfer_in', sourceAmount: -500, cashFlowAmount: 500 }),
        baseTransaction({ id: 'transfer-out', type: 'transfer_out', sourceAmount: 500, cashFlowAmount: -500 }),
        baseTransaction({ id: 'buy', type: 'buy', sourceAmount: 1000, cashFlowAmount: -1000 }),
        baseTransaction({ id: 'sell', type: 'sell', sourceAmount: -1000, cashFlowAmount: 1000 }),
        baseTransaction({ id: 'pending', pending: true, sourceAmount: 40, cashFlowAmount: -40 }),
      ];

      const result = summarizeCashFlow(
        transactions,
        { start: '2026-05-01T00:00:00.000Z', endExclusive: '2026-06-01T00:00:00.000Z' },
        'USD'
      );

      expect(result.incomeTotal).toBe(2500);
      expect(result.expenseTotal).toBe(85);
      expect(result.operatingCashFlow).toBe(2415);
      expect(result.byExpenseCategory).toEqual({ Groceries: 80, Fees: 5 });
      expect(result.includedTransactionIds).toEqual(['salary', 'groceries', 'fee', 'refund']);
      expect(result.excludedTransactionIds).toEqual([
        'transfer-in',
        'transfer-out',
        'buy',
        'sell',
        'pending',
      ]);
    });

    it('includes zero-activity months in monthly averages', () => {
      const result = summarizeCashFlow(
        [
          baseTransaction({
            id: 'january-income',
            effectiveDate: '2026-01-15T12:00:00.000Z',
            type: 'income',
            sourceAmount: -3000,
            cashFlowAmount: 3000,
          }),
        ],
        { start: '2026-01-01T00:00:00.000Z', endExclusive: '2026-04-01T00:00:00.000Z' },
        'USD'
      );

      expect(Object.keys(result.byMonth)).toEqual(['2026-01', '2026-02', '2026-03']);
      expect(averageMonthlyCashFlow(result)).toEqual({
        monthCount: 3,
        averageIncome: 1000,
        averageExpenses: 0,
        averageOperatingCashFlow: 1000,
      });
    });

    it('rejects sign/type disagreements instead of silently flipping them', () => {
      expect(() =>
        summarizeCashFlow(
          [baseTransaction({ id: 'bad-expense', type: 'expense', cashFlowAmount: 100 })],
          { start: '2026-05-01T00:00:00.000Z', endExclusive: '2026-06-01T00:00:00.000Z' },
          'USD'
        )
      ).toThrow('Expense transaction bad-expense must have a non-positive cashFlowAmount');
    });

    it('requires currency conversion before aggregation', () => {
      expect(() =>
        summarizeCashFlow(
          [baseTransaction({ id: 'cad-expense', currency: 'CAD' })],
          { start: '2026-05-01T00:00:00.000Z', endExclusive: '2026-06-01T00:00:00.000Z' },
          'USD'
        )
      ).toThrow('convert it to USD before aggregation');
    });

    it('keeps the shared transaction vocabulary exhaustive and stable', () => {
      expect(CANONICAL_TRANSACTION_TYPES).toEqual([
        'income',
        'expense',
        'transfer_in',
        'transfer_out',
        'buy',
        'sell',
        'deposit',
        'withdrawal',
        'fee',
        'refund',
        'adjustment',
      ]);
      expect(isCanonicalTransactionType('refund')).toBe(true);
      expect(isCanonicalTransactionType('groceries')).toBe(false);
    });

    it('interprets date-only values as UTC and rejects timezone-less timestamps', () => {
      const result = summarizeCashFlow(
        [baseTransaction({ id: 'date-only', effectiveDate: '2026-05-31' })],
        { start: '2026-05-01', endExclusive: '2026-06-01' },
        'USD'
      );

      expect(result.byMonth['2026-05'].expenses).toBe(100);
      expect(() =>
        summarizeCashFlow(
          [baseTransaction({ id: 'local-time', effectiveDate: '2026-05-31T23:30:00' })],
          { start: '2026-05-01', endExclusive: '2026-06-01' },
          'USD'
        )
      ).toThrow('effectiveDate for local-time timestamp must include a timezone offset');
    });
  });

  describe('core metric formulas', () => {
    it('calculates assets, liabilities, and net worth from non-negative magnitudes', () => {
      expect(
        computeFinancialOverview({
          reportingCurrency: 'usd',
          totalCash: 25_000,
          totalInvestments: 400_000,
          homeValue: 600_000,
          otherAssets: 10_000,
          totalDebt: 350_000,
          otherLiabilities: 5_000,
        })
      ).toEqual({
        reportingCurrency: 'USD',
        totalCash: 25_000,
        totalInvestments: 400_000,
        homeValue: 600_000,
        otherAssets: 10_000,
        totalAssets: 1_035_000,
        totalDebt: 350_000,
        otherLiabilities: 5_000,
        totalLiabilities: 355_000,
        netWorth: 680_000,
      });
    });

    it('preserves unknown home value as null and rejects signed liabilities', () => {
      expect(
        computeFinancialOverview({
          reportingCurrency: 'USD',
          totalCash: 1000,
          totalInvestments: 0,
          homeValue: null,
          totalDebt: 0,
        }).homeValue
      ).toBeNull();

      expect(() =>
        computeFinancialOverview({
          reportingCurrency: 'USD',
          totalCash: 1000,
          totalInvestments: 0,
          totalDebt: -500,
        })
      ).toThrow('totalDebt must be a non-negative magnitude');
    });

    it('defines every core user-facing metric once', () => {
      expect(Object.keys(CORE_METRIC_DEFINITIONS)).toEqual([
        'totalCash',
        'totalInvestments',
        'homeValue',
        'totalAssets',
        'totalDebt',
        'totalLiabilities',
        'netWorth',
        'incomeTotal',
        'expenseTotal',
        'operatingCashFlow',
        'averageMonthlyIncome',
        'averageMonthlyExpenses',
      ]);
    });
  });

  describe('snapshot quality', () => {
    const computedAt = '2026-05-10T12:00:00.000Z';
    const oneDay = 24 * 60 * 60 * 1000;

    it('uses the oldest source observation as asOf', () => {
      const quality = evaluateSnapshotQuality(
        [
          { id: 'balances', required: true, status: 'available', asOf: '2026-05-10T10:00:00.000Z', maxAgeMs: oneDay },
          { id: 'holdings', required: true, status: 'available', asOf: '2026-05-10T08:00:00.000Z', maxAgeMs: oneDay },
        ],
        computedAt
      );

      expect(quality.status).toBe('current');
      expect(quality.asOf?.toISOString()).toBe('2026-05-10T08:00:00.000Z');
    });

    it('does not let a recent compute time hide stale source data', () => {
      const quality = evaluateSnapshotQuality(
        [
          { id: 'balances', required: true, status: 'available', asOf: '2026-05-08T10:00:00.000Z', maxAgeMs: oneDay },
        ],
        computedAt
      );

      expect(quality.status).toBe('stale');
      expect(quality.staleSourceIds).toEqual(['balances']);
    });

    it('never marks a non-expiring source stale, however old it is', () => {
      const quality = evaluateSnapshotQuality(
        [
          { id: 'balances', required: true, status: 'available', asOf: '2026-05-10T10:00:00.000Z', maxAgeMs: oneDay },
          // A user-entered value: age alone cannot make it wrong.
          { id: 'account:manual-1', required: true, status: 'available', asOf: '2025-01-01T00:00:00.000Z', maxAgeMs: null },
        ],
        computedAt
      );

      expect(quality.staleSourceIds).toEqual([]);
      expect(quality.status).toBe('current');
    });

    it('excludes non-expiring sources from asOf so an old edit cannot backdate it', () => {
      const quality = evaluateSnapshotQuality(
        [
          { id: 'balances', required: true, status: 'available', asOf: '2026-05-10T10:00:00.000Z', maxAgeMs: oneDay },
          { id: 'account:manual-1', required: true, status: 'available', asOf: '2025-01-01T00:00:00.000Z', maxAgeMs: null },
        ],
        computedAt
      );

      expect(quality.asOf?.toISOString()).toBe('2026-05-10T10:00:00.000Z');
      expect(quality.status).toBe('current');
    });

    it('reports no asOf when nothing in the snapshot can age', () => {
      const quality = evaluateSnapshotQuality(
        [
          { id: 'account:manual-1', required: true, status: 'available', asOf: '2025-01-01T00:00:00.000Z', maxAgeMs: null },
        ],
        computedAt
      );

      // There is data, so this is not 'unavailable' — there is simply no
      // provider age to report.
      expect(quality.asOf).toBeNull();
      expect(quality.status).toBe('current');
    });

    describe('newest source observation', () => {
      it('reports the newest expiring observation, not the oldest', () => {
        expect(newestExpiringSourceAsOf([
          { id: 'balances', required: true, status: 'available', asOf: '2026-05-10T10:00:00.000Z', maxAgeMs: oneDay },
          { id: 'holdings', required: true, status: 'available', asOf: '2026-05-10T08:00:00.000Z', maxAgeMs: oneDay },
        ])?.toISOString()).toBe('2026-05-10T10:00:00.000Z');
      });

      it('excludes non-expiring sources so a user edit cannot pass for a provider fetch', () => {
        expect(newestExpiringSourceAsOf([
          { id: 'balances', required: true, status: 'available', asOf: '2026-05-10T08:00:00.000Z', maxAgeMs: oneDay },
          // Entered by hand minutes ago; it says nothing about provider freshness.
          { id: 'account:manual-1', required: true, status: 'available', asOf: '2026-05-10T11:59:00.000Z', maxAgeMs: null },
        ])?.toISOString()).toBe('2026-05-10T08:00:00.000Z');
      });

      it('ignores unavailable sources and reports null when nothing can age', () => {
        expect(newestExpiringSourceAsOf([
          { id: 'holdings', required: true, status: 'unavailable', asOf: null, maxAgeMs: oneDay },
          { id: 'account:manual-1', required: true, status: 'available', asOf: '2026-05-10T11:00:00.000Z', maxAgeMs: null },
        ])).toBeNull();
      });

      it('skips unreadable persisted entries instead of throwing', () => {
        expect(newestExpiringSourceAsOf([
          null,
          'not an observation',
          { id: 'broken', status: 'available', asOf: 'never', maxAgeMs: oneDay },
          { id: 'no-max-age', status: 'available', asOf: '2026-05-10T11:00:00.000Z' },
          { id: 'balances', status: 'available', asOf: '2026-05-10T09:00:00.000Z', maxAgeMs: oneDay },
        ])?.toISOString()).toBe('2026-05-10T09:00:00.000Z');

        expect(newestExpiringSourceAsOf([])).toBeNull();
      });
    });

    it('rejects a negative max age but accepts an explicit null', () => {
      expect(() =>
        evaluateSnapshotQuality(
          [{ id: 'balances', required: true, status: 'available', asOf: computedAt, maxAgeMs: -1 }],
          computedAt
        )
      ).toThrow('non-negative finite number or null');

      expect(() =>
        evaluateSnapshotQuality(
          [{ id: 'balances', required: true, status: 'available', asOf: computedAt, maxAgeMs: null }],
          computedAt
        )
      ).not.toThrow();
    });

    it('marks a snapshot partial when a required source failed', () => {
      const quality = evaluateSnapshotQuality(
        [
          { id: 'balances', required: true, status: 'available', asOf: '2026-05-10T10:00:00.000Z', maxAgeMs: oneDay },
          { id: 'holdings', required: true, status: 'unavailable', asOf: null, maxAgeMs: oneDay, error: 'provider timeout' },
          { id: 'home-value', required: false, status: 'unavailable', asOf: null, maxAgeMs: 30 * oneDay },
        ],
        computedAt
      );

      expect(quality.status).toBe('partial');
      expect(quality.unavailableSourceIds).toEqual(['holdings', 'home-value']);
      expect(quality.requiredUnavailableSourceIds).toEqual(['holdings']);
      expect(quality.errors).toEqual([{ sourceId: 'holdings', message: 'provider timeout' }]);
    });

    it('preserves stale provenance when partial status takes precedence', () => {
      const quality = evaluateSnapshotQuality(
        [
          { id: 'balances', required: true, status: 'available', asOf: '2026-05-08T10:00:00.000Z', maxAgeMs: oneDay },
          { id: 'holdings', required: true, status: 'unavailable', asOf: null, maxAgeMs: oneDay },
        ],
        computedAt
      );

      expect(quality.status).toBe('partial');
      expect(quality.staleSourceIds).toEqual(['balances']);
      expect(quality.unavailableSourceIds).toEqual(['holdings']);
      expect(quality.requiredUnavailableSourceIds).toEqual(['holdings']);
    });

    it('marks a snapshot unavailable when no source observation exists', () => {
      expect(
        evaluateSnapshotQuality(
          [{ id: 'balances', required: true, status: 'unavailable', asOf: null, maxAgeMs: oneDay }],
          computedAt
        ).status
      ).toBe('unavailable');
    });
  });
});
