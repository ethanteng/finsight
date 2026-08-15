import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const updateProfile = jest.fn<(userId: string, profile: string) => Promise<void>>();
const getOriginalProfile = jest.fn<(userId: string) => Promise<string>>();

jest.mock('../../profile/manager', () => ({
  ProfileManager: jest.fn().mockImplementation(() => ({
    getOriginalProfile,
    updateProfile,
  })),
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ userProfile: { updateMany: jest.fn() } }),
}));

import {
  enhanceProfileWithEnrichmentData,
  enhanceProfileWithInvestmentData,
  enhanceProfileWithLiabilityData,
} from '../../profile/enhancer';

/** The insight text written into the profile the model reads. */
async function profileTextFrom(run: () => Promise<void>): Promise<string> {
  updateProfile.mockClear();
  await run();
  expect(updateProfile).toHaveBeenCalledTimes(1);
  return updateProfile.mock.calls[0][1];
}

describe('profile enhancer grouping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOriginalProfile.mockResolvedValue('Existing profile');
  });

  it('writes one allocation line per asset class however providers spell the type', async () => {
    const text = await profileTextFrom(() =>
      enhanceProfileWithInvestmentData(
        'user-1',
        [
          { security_id: 's1', institution_value: 600, security: { type: 'etf' } },
          { security_id: 's2', institution_value: 200, security: { type: 'ETF' } },
          { security_id: 's3', institution_value: 200, security: { type: 'Common Stock' } },
        ],
        []
      )
    );

    expect(text).toContain('Asset Allocation: ETF: 80.0%, Equity: 20.0%');
  });

  it('reports one spending total per category, under a normalized label', async () => {
    const text = await profileTextFrom(() =>
      enhanceProfileWithEnrichmentData('user-1', [
        { transaction_type: 'expense', amount: 120, category: ['FOOD_AND_DRINK'] },
        { transaction_type: 'expense', amount: 80, category: ['Food and Drink'] },
        { transaction_type: 'expense', amount: 50, category: ['Travel'] },
      ])
    );

    expect(text).toContain('Top Spending Categories: Food And Drink: $200, Travel: $50');
    expect(text).not.toContain('FOOD_AND_DRINK');
  });

  it('reports one debt total per liability type however it is spelled', async () => {
    const text = await profileTextFrom(() =>
      enhanceProfileWithLiabilityData('user-1', [
        { type: 'credit', last_statement_balance: 3_000, interest_rate: 20 },
        { type: 'CREDIT', last_statement_balance: 2_000, interest_rate: 20 },
        { type: 'mortgage', last_statement_balance: 400_000, interest_rate: 6 },
      ])
    );

    expect(text).toContain('Debt Types: Credit: $5,000, Mortgage: $400,000');
    expect(text).not.toContain('Credit: $3,000');
  });
});
