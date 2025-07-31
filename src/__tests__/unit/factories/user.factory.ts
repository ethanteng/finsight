import { UserTier } from '../../../data/types';

export const createTestUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  tier: UserTier.STARTER,
  createdAt: new Date(),
  updatedAt: new Date(),
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