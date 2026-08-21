import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockGetOriginalProfile = jest.fn<any>();
const mockExtractHomeData = jest.fn<any>();
const mockUpdateHomeValue = jest.fn<any>();

jest.mock('../../profile/manager', () => ({
  ProfileManager: jest.fn(() => ({
    getOriginalProfile: mockGetOriginalProfile,
    extractHomeData: mockExtractHomeData,
    updateHomeValue: mockUpdateHomeValue,
  })),
}));

const mockProfileFindMany = jest.fn<any>();
const mockDisconnect = jest.fn<any>();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    userProfile: { findMany: mockProfileFindMany },
    $disconnect: mockDisconnect,
  })),
}));

const { PrismaClient: mockPrismaClient } = jest.requireMock('@prisma/client') as {
  PrismaClient: jest.Mock;
};

import {
  HomeValueRefreshService,
  HOME_VALUE_MIN_REFRESH_AGE_MS,
  runHomeValueRefresh,
} from '../../services/home-value-refresh';
import { REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES } from '../../services/subscription-refresh-eligibility';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

describe('HomeValueRefreshService.refreshUserHomeValue', () => {
  let service: HomeValueRefreshService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HomeValueRefreshService();
    mockGetOriginalProfile.mockResolvedValue('profile text');
    mockUpdateHomeValue.mockResolvedValue(1_250_000);
    mockExtractHomeData.mockReturnValue({
      address: '1 Main St',
      lastUpdated: daysAgo(70),
      isManualOverride: false,
    });
  });

  it('refreshes an estimate that has aged past the minimum interval', async () => {
    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('refreshed');
    expect(mockUpdateHomeValue).toHaveBeenCalledWith('user-1', '1 Main St');
    expect(mockPrismaClient).not.toHaveBeenCalled();
  });

  it('never overwrites a value the user entered by hand', async () => {
    mockExtractHomeData.mockReturnValue({
      address: '1 Main St',
      lastUpdated: daysAgo(400),
      isManualOverride: true,
    });

    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('skipped-manual-override');
    expect(mockUpdateHomeValue).not.toHaveBeenCalled();
  });

  it('does not spend a provider call on a value refreshed a day ago', async () => {
    mockExtractHomeData.mockReturnValue({
      address: '1 Main St',
      lastUpdated: daysAgo(1),
      isManualOverride: false,
    });

    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('skipped-recent');
    expect(mockUpdateHomeValue).not.toHaveBeenCalled();
  });

  it('refreshes anything already past the staleness window', async () => {
    // The 25-day guard sits below the 30-day staleness window, so a value the
    // UI is flagging as stale is always eligible.
    expect(HOME_VALUE_MIN_REFRESH_AGE_MS).toBeLessThan(30 * 24 * 60 * 60 * 1000);

    mockExtractHomeData.mockReturnValue({
      address: '1 Main St',
      lastUpdated: daysAgo(31),
      isManualOverride: false,
    });

    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('refreshed');
  });

  it('reports a provider failure instead of throwing', async () => {
    mockUpdateHomeValue.mockRejectedValue(new Error('RentCast down'));

    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('failed-provider');
  });

  it('separates an address RentCast cannot value from the provider being down', async () => {
    mockUpdateHomeValue.mockResolvedValue(null);

    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('failed-address');
  });

  it('skips a user with no home address', async () => {
    mockExtractHomeData.mockReturnValue({ address: null, lastUpdated: null, isManualOverride: false });

    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('skipped-no-address');
    expect(mockUpdateHomeValue).not.toHaveBeenCalled();
  });
});

describe('runHomeValueRefresh standalone entry point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOriginalProfile.mockResolvedValue('profile text');
    mockExtractHomeData.mockReturnValue({
      address: '1 Main St',
      lastUpdated: daysAgo(70),
      isManualOverride: false,
    });
  });

  it('exits nonzero on a provider failure but not on an unvaluable address', async () => {
    mockProfileFindMany.mockResolvedValue([{ userId: 'unvaluable-1' }]);
    mockUpdateHomeValue.mockResolvedValue(null);
    await expect(runHomeValueRefresh()).resolves.toBeUndefined();

    mockProfileFindMany.mockResolvedValue([{ userId: 'outage-1' }]);
    mockUpdateHomeValue.mockRejectedValue(new Error('RentCast API error (503): unavailable'));
    await expect(runHomeValueRefresh()).rejects.toThrow('could not reach RentCast');
  });
});

describe('HomeValueRefreshService.refreshAllHomeValues', () => {
  let service: HomeValueRefreshService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HomeValueRefreshService();
    mockGetOriginalProfile.mockResolvedValue('profile text');
    mockUpdateHomeValue.mockResolvedValue(1_250_000);
    mockProfileFindMany.mockResolvedValue([
      { userId: 'changed-1' },
      { userId: 'manual-1' },
      { userId: 'recent-1' },
      { userId: 'no-address-1' },
    ]);
    mockExtractHomeData.mockImplementation(() => ({
      address: '1 Main St',
      lastUpdated: daysAgo(70),
      isManualOverride: false,
    }));
  });

  it('reports only the users whose stored value actually changed', async () => {
    // getOriginalProfile is called once per user, in list order.
    const byCall = [
      { address: '1 Main St', lastUpdated: daysAgo(70), isManualOverride: false },  // changed-1
      { address: '2 Main St', lastUpdated: daysAgo(400), isManualOverride: true },  // manual-1
      { address: '3 Main St', lastUpdated: daysAgo(2), isManualOverride: false },   // recent-1
      { address: null, lastUpdated: null, isManualOverride: false },                // no-address-1
    ];
    let call = 0;
    mockExtractHomeData.mockImplementation(() => byCall[call++]);

    const results = await service.refreshAllHomeValues();

    // Only a user whose value was actually re-fetched needs a recompute; a
    // skipped user's snapshot still matches their profile.
    expect(results.refreshedUserIds).toEqual(['changed-1']);
    // The address-less user is not counted at all.
    expect(results.total).toBe(3);
    expect(results.successful).toBe(3);
    expect(results.failed).toBe(0);
    expect(mockProfileFindMany).toHaveBeenCalledWith({
      // The subscription clause keeps a canceled subscriber's address from
      // going back to RentCast every night; profile isActive alone never
      // changes when billing does.
      where: {
        userId: { not: null },
        isActive: true,
        user: { is: { subscriptionStatus: { in: [...REFRESH_ELIGIBLE_SUBSCRIPTION_STATUSES] } } },
      },
      select: { userId: true },
    });
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does not report a user whose provider call failed', async () => {
    mockProfileFindMany.mockResolvedValue([{ userId: 'failed-1' }]);
    mockUpdateHomeValue.mockResolvedValue(null);

    const results = await service.refreshAllHomeValues();

    expect(results.refreshedUserIds).toEqual([]);
    expect(results.failed).toBe(1);
  });

  it('reports zero provider failures when every eligible address is unvaluable', async () => {
    // The cron fails only on providerFailures, so this batch must not produce
    // one: a single user with an unlistable address would otherwise keep the
    // job red on every run.
    mockProfileFindMany.mockResolvedValue([{ userId: 'unvaluable-1' }]);
    mockUpdateHomeValue.mockResolvedValue(null);

    const results = await service.refreshAllHomeValues();

    expect(results.total).toBe(1);
    expect(results.failed).toBe(1);
    expect(results.unvaluableAddresses).toBe(1);
    expect(results.providerFailures).toBe(0);
  });

  it('counts an unvaluable address apart from an unreachable provider', async () => {
    // The scheduled job fails on the second and only reports the first: an
    // address RentCast cannot value fails the same way on every run.
    mockProfileFindMany.mockResolvedValue([{ userId: 'unvaluable-1' }, { userId: 'outage-1' }]);
    mockUpdateHomeValue
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('RentCast API error (503): unavailable'));

    const results = await service.refreshAllHomeValues();

    expect(results.failed).toBe(2);
    expect(results.unvaluableAddresses).toBe(1);
    expect(results.providerFailures).toBe(1);
    expect(results.errors).toEqual([
      { userId: 'unvaluable-1', error: expect.any(String), kind: 'address' },
      { userId: 'outage-1', error: expect.any(String), kind: 'provider' },
    ]);
  });
});
