import { UserTier } from '../../../data/types';

export const createTestUser = (overrides = {}) => ({
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  tier: UserTier.STARTER,
  isActive: true,
  emailVerified: false,
  ...overrides
});

export const createTestUserWithTier = (tier: UserTier, overrides = {}) => 
  createTestUser({ tier, ...overrides });

export const createTestStarterUser = (overrides = {}) => 
  createTestUserWithTier(UserTier.STARTER, overrides);

export const createTestStandardUser = (overrides = {}) => 
  createTestUserWithTier(UserTier.STANDARD, overrides);

export const createTestPremiumUser = (overrides = {}) => 
  createTestUserWithTier(UserTier.PREMIUM, overrides);

export const createTestAccessToken = (overrides = {}) => ({
  userId: 'test-user-id',
  token: 'test-access-token',
  itemId: 'test-item-id',
  ...overrides
}); 