import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildCashFlowModel, expectedMonthly } from '../../cash-flow/forecast';
import { ACCOUNTS, householdTransactions } from './factories/cash-flow.factory';

const mockGetSnapshot = jest.fn<any>();
const mockBuildTierContext = jest.fn<any>();
const mockFindUser = jest.fn<any>();
const mockLoadCashFlowModel = jest.fn<any>();

jest.mock('../../services/financial-snapshot-persistence', () => ({
  getFinancialSnapshotForAnalysis: mockGetSnapshot,
}));

jest.mock('../../data/orchestrator', () => ({
  dataOrchestrator: { buildTierAwareContext: mockBuildTierContext },
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ user: { findUnique: mockFindUser } }),
}));

jest.mock('../../services/cash-flow-service', () => ({
  loadCashFlowModel: mockLoadCashFlowModel,
}));

import { gatherContextSnapshot } from '../../openai/context-service';

const model = buildCashFlowModel({
  transactions: householdTransactions('2026-06-03', '2026-09-30'),
  accounts: ACCOUNTS,
  plannedEvents: [],
  dataThrough: '2026-09-30',
  today: '2026-10-01',
});

const needs = (needsCashFlowForecast: boolean) => ({
  needsMarketContext: false,
  needsSearchContext: false,
  needsHomeValue: false,
  needsInvestments: false,
  needsRetirement: false,
  needsAccountDetails: false,
  needsTransactionDetails: false,
  needsMonthlyCashFlow: false,
  needsCashFlowForecast,
  needsUserProfile: false,
  needsSecondaryValidation: false,
});

const gather = (needsCashFlowForecast = false) => gatherContextSnapshot({
  userId: 'user-1',
  question: 'How much can I save each month?',
  questionNeeds: needs(needsCashFlowForecast),
  tier: 'basic' as any,
  deferRetirementAnalysis: true,
});

describe('gatherContextSnapshot cash flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildTierContext.mockResolvedValue({ tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] });
    mockFindUser.mockResolvedValue({ monthlyIncomeOverride: null, monthlyExpenseOverride: null });
    mockGetSnapshot.mockResolvedValue({
      computedAt: new Date('2026-10-01T03:00:00.000Z'),
      asOf: new Date('2026-10-01T02:00:00.000Z'),
      status: 'current',
      reportingCurrency: 'USD',
      transactionsSummary: {
        reportingCurrency: 'USD',
        incomeTotal: 30_000,
        expenseTotal: 20_000,
        operatingCashFlow: 10_000,
        byCategory: {},
        byMonth: {
          '2026-07': { income: 9_000, expense: 6_000, operatingCashFlow: 3_000 },
          '2026-08': { income: 10_000, expense: 7_000, operatingCashFlow: 3_000 },
          '2026-09': { income: 11_000, expense: 7_000, operatingCashFlow: 4_000 },
          '2026-10': { income: 0, expense: 0, operatingCashFlow: 0 },
        },
        coverageStartDate: '2026-07-04',
      },
      financialOverview: { netWorth: 100_000, totalCash: 20_000, totalInvestments: 90_000, totalDebt: 10_000, homeValue: null },
      investmentPortfolio: {},
      meta: {},
    });
    mockLoadCashFlowModel.mockResolvedValue({ model, snapshot: { computedAt: '2026-10-01T03:00:00.000Z', asOf: null, status: 'current' } });
  });

  it('carries what happened over complete months and what the forecast expects, on every question', async () => {
    const result = await gather();

    // July starts on the 4th and October has only begun: August and September are averaged.
    expect(result.averageMonthlyIncome).toBe(10_500);
    expect(result.averageMonthlyExpense).toBe(7_000);
    expect(result.averageMonthlyMonths).toEqual({ count: 2, firstMonth: '2026-08', lastMonth: '2026-09' });
    expect(result.expectedMonthly).toEqual({
      ...expectedMonthly(model),
      typicalBasisDays: model.typical.basisDays,
      dataThrough: '2026-09-30',
    });
    // The full forecast pack is built only when the plan asked for it.
    expect(result.cashFlowForecast).toBeUndefined();
    expect((await gather(true)).cashFlowForecast).toMatchObject({ status: 'available' });
  });

  it('takes the user’s own monthly figures as expected when there is nothing to forecast from', async () => {
    mockLoadCashFlowModel.mockResolvedValue(null);
    mockFindUser.mockResolvedValue({ monthlyIncomeOverride: 9_000, monthlyExpenseOverride: null });

    const result = await gather(true);
    expect(result.expectedMonthly).toEqual({
      income: 9_000,
      spending: null,
      incomeSource: 'override',
      spendingSource: 'transactions',
      typicalBasisDays: 0,
      dataThrough: null,
    });
    expect(result.cashFlowForecast).toEqual({ status: 'unavailable', reason: 'no_snapshot' });
  });

  it('keeps the history when the forecast cannot be built', async () => {
    mockLoadCashFlowModel.mockRejectedValue(new Error('database down'));
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await gather(true);
    quiet.mockRestore();
    expect(result.expectedMonthly).toBeNull();
    expect(result.averageMonthlyIncome).toBe(10_500);
    expect(result.cashFlowForecast).toEqual({ status: 'unavailable', reason: 'error' });
  });
});
