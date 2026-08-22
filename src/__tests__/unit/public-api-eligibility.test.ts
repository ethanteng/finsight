const findFirstSnapshot = jest.fn();
const findUniqueSnapTradeUser = jest.fn();
const findUniqueCredential = jest.fn();

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({
    financialSummarySnapshot: { findFirst: findFirstSnapshot },
    snapTradeUser: { findUnique: findUniqueSnapTradeUser },
    publicApiCredential: { findUnique: findUniqueCredential },
  }),
}));

import { getPublicEligibility } from '../../services/public-api/eligibility';

describe('getPublicEligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findFirstSnapshot.mockResolvedValue({
      accounts: [
        { id: 'snaptrade-public', source: 'snaptrade', institution: 'Public' },
        { id: 'snaptrade-fidelity', source: 'snaptrade', institution: 'Fidelity' },
      ],
    });
    findUniqueSnapTradeUser.mockResolvedValue({ id: 'st-user' });
    findUniqueCredential.mockResolvedValue(null);
  });

  it('is eligible when SnapTrade still links Public', async () => {
    await expect(getPublicEligibility('user-1')).resolves.toEqual({
      eligible: true,
      configured: false,
      snapTradeAccountIds: ['snaptrade-public'],
    });
  });

  // Disconnect-all deletes SnapTradeUser + the credential immediately, but the
  // snapshot rebuild is async. Stale Public rows must not re-open the key form.
  it('is not eligible from a stale snapshot after SnapTrade was disconnected', async () => {
    findUniqueSnapTradeUser.mockResolvedValue(null);

    await expect(getPublicEligibility('user-1')).resolves.toEqual({
      eligible: false,
      configured: false,
      snapTradeAccountIds: [],
    });
  });

  it('stays eligible via a stored credential even without a SnapTrade link', async () => {
    findUniqueSnapTradeUser.mockResolvedValue(null);
    findUniqueCredential.mockResolvedValue({ id: 'cred' });

    await expect(getPublicEligibility('user-1')).resolves.toEqual({
      eligible: true,
      configured: true,
      snapTradeAccountIds: [],
    });
  });
});
