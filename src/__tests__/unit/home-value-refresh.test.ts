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

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    userProfile: { findMany: jest.fn() },
    $disconnect: jest.fn(),
  })),
}));

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
