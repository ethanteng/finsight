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
} from '../../services/home-value-refresh';

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

    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('failed');
  });

  it('skips a user with no home address', async () => {
    mockExtractHomeData.mockReturnValue({ address: null, lastUpdated: null, isManualOverride: false });

    await expect(service.refreshUserHomeValue('user-1')).resolves.toBe('skipped-no-address');
    expect(mockUpdateHomeValue).not.toHaveBeenCalled();
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
      where: { userId: { not: null }, isActive: true },
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
});
