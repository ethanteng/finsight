import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetHomeValue = jest.fn<any>();

jest.mock('../../profile/extractor', () => ({
  ProfileExtractor: jest.fn(() => ({})),
}));

jest.mock('../../services/rentcast', () => ({
  RentCastService: jest.fn(() => ({
    validateAddress: () => true,
    getHomeValue: mockGetHomeValue,
  })),
}));

import { ProfileManager } from '../../profile/manager';

describe('ProfileManager RentCast identity persistence', () => {
  let manager: ProfileManager;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PROFILE_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-here';
    manager = new ProfileManager();
  });

  it('stores RentCast standardized address and property ID with the estimate', async () => {
    mockGetHomeValue.mockResolvedValue({
      price: 750_000,
      priceRangeLow: 700_000,
      priceRangeHigh: 810_000,
      subjectProperty: {
        id: 'property-123',
        formattedAddress: '1 Main St, Austin, TX 78701',
      },
    });
    jest.spyOn(manager, 'getOriginalProfile').mockResolvedValue('Existing profile');
    const update = jest.spyOn(manager, 'updateProfile').mockResolvedValue();

    await expect(manager.updateHomeValue('user-1', '1 main st austin tx 78701')).resolves.toBe(750_000);

    expect(update.mock.calls[0][1]).toContain('HOME_ADDRESS: 1 Main St, Austin, TX 78701');
    expect(update.mock.calls[0][1]).toContain('HOME_RENTCAST_PROPERTY_ID: property-123');
  });

  it('rejects an unexpected property-ID change when refreshing the same address', async () => {
    mockGetHomeValue.mockResolvedValue({
      price: 760_000,
      priceRangeLow: 710_000,
      priceRangeHigh: 820_000,
      subjectProperty: {
        id: 'property-456',
        formattedAddress: '1 Main St, Austin, TX 78701',
      },
    });
    jest.spyOn(manager, 'getOriginalProfile').mockResolvedValue([
      'HOME_ADDRESS: 1 Main St, Austin, TX 78701',
      'HOME_RENTCAST_PROPERTY_ID: property-123',
      'HOME_VALUE: 750000',
    ].join('\n'));
    const update = jest.spyOn(manager, 'updateProfile').mockResolvedValue();

    await expect(manager.updateHomeValue('user-1', '1 Main St, Austin, TX 78701')).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
