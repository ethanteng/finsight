// Import types that don't depend on env vars
import type { SubscriptionTier } from '../../types/stripe';

// Mock environment variables for testing
const originalEnv = process.env;

beforeEach(() => {
  // Clear module cache to ensure fresh module load with new env vars
  jest.resetModules();
  delete require.cache[require.resolve('../../types/stripe')];
  delete require.cache[require.resolve('../../config/stripe')];
  
  process.env = { ...originalEnv };
  
  // Set test environment variables - single-tier pricing: all tiers use the same price ID
  const singlePriceId = 'price_single_tier_test';
  process.env.STRIPE_PRICE_STARTER = singlePriceId;
  process.env.STRIPE_PRICE_STANDARD = singlePriceId;
  process.env.STRIPE_PRICE_PREMIUM = singlePriceId;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('Stripe Configuration', () => {
  // Dynamically import modules after env vars are set
  let SUBSCRIPTION_PLANS: any;
  let TIER_ACCESS: any;
  let getStripePriceId: any;
  let getTierFromPriceId: any;

  beforeAll(() => {
    // Import modules after env vars are set in beforeEach
    const stripeTypes = require('../../types/stripe');
    const stripeConfig = require('../../config/stripe');
    SUBSCRIPTION_PLANS = stripeTypes.SUBSCRIPTION_PLANS;
    TIER_ACCESS = stripeTypes.TIER_ACCESS;
    getStripePriceId = stripeConfig.getStripePriceId;
    getTierFromPriceId = stripeConfig.getTierFromPriceId;
  });

  describe('SUBSCRIPTION_PLANS', () => {
    it('should have all three subscription tiers', () => {
      const plans = require('../../types/stripe').SUBSCRIPTION_PLANS;
      expect(plans).toHaveProperty('starter');
      expect(plans).toHaveProperty('standard');
      expect(plans).toHaveProperty('premium');
    });

    it('should have correct pricing for each tier', () => {
      // Single-tier pricing: all tiers use the same price ($9/month)
      const plans = require('../../types/stripe').SUBSCRIPTION_PLANS;
      expect(plans.starter.price).toBe(9);
      expect(plans.standard.price).toBe(9);
      expect(plans.premium.price).toBe(9);
    });

    it('should have monthly billing interval', () => {
      const plans = require('../../types/stripe').SUBSCRIPTION_PLANS;
      Object.values(plans).forEach((plan: any) => {
        expect(plan.interval).toBe('month');
      });
    });

    it('should have USD currency', () => {
      const plans = require('../../types/stripe').SUBSCRIPTION_PLANS;
      Object.values(plans).forEach((plan: any) => {
        expect(plan.currency).toBe('usd');
      });
    });

    it('should have features for each tier', () => {
      const plans = require('../../types/stripe').SUBSCRIPTION_PLANS;
      Object.values(plans).forEach((plan: any) => {
        expect(plan.features).toBeInstanceOf(Array);
        expect(plan.features.length).toBeGreaterThan(0);
      });
    });
  });

  describe('TIER_ACCESS', () => {
    it('should define access levels for each tier', () => {
      const tierAccess = require('../../types/stripe').TIER_ACCESS;
      expect(tierAccess).toHaveProperty('starter');
      expect(tierAccess).toHaveProperty('standard');
      expect(tierAccess).toHaveProperty('premium');
    });

    it('should have progressive access levels', () => {
      const tierAccess = require('../../types/stripe').TIER_ACCESS;
      const starterFeatures = tierAccess.starter;
      const standardFeatures = tierAccess.standard;
      const premiumFeatures = tierAccess.premium;

      // Starter should have basic features
      expect(starterFeatures).toContain('basic-analysis');
      expect(starterFeatures).toContain('account-balances');

      // Standard should include starter features plus more
      expect(standardFeatures).toContain('basic-analysis');
      expect(standardFeatures).toContain('account-balances');
      expect(standardFeatures).toContain('economic-indicators');
      expect(standardFeatures).toContain('rag-system');

      // Premium should include all features
      expect(premiumFeatures).toContain('basic-analysis');
      expect(premiumFeatures).toContain('account-balances');
      expect(premiumFeatures).toContain('economic-indicators');
      expect(premiumFeatures).toContain('rag-system');
      expect(premiumFeatures).toContain('live-market-data');
    });

    it('should have more features for higher tiers', () => {
      const tierAccess = require('../../types/stripe').TIER_ACCESS;
      expect(tierAccess.starter.length).toBeLessThan(tierAccess.standard.length);
      expect(tierAccess.standard.length).toBeLessThan(tierAccess.premium.length);
    });
  });

  describe('getStripePriceId', () => {
    it('should return correct price ID for valid tier', () => {
      // Single-tier pricing: all tiers return the same price ID
      const getStripePriceIdFn = require('../../config/stripe').getStripePriceId;
      const singlePriceId = 'price_single_tier_test';
      expect(getStripePriceIdFn('starter')).toBe(singlePriceId);
      expect(getStripePriceIdFn('standard')).toBe(singlePriceId);
      expect(getStripePriceIdFn('premium')).toBe(singlePriceId);
    });

    it('should throw error for invalid tier', () => {
      const getStripePriceIdFn = require('../../config/stripe').getStripePriceId;
      expect(() => getStripePriceIdFn('invalid' as SubscriptionTier)).toThrow('Invalid subscription tier: invalid');
    });
  });

  describe('getTierFromPriceId', () => {
    it('should return premium tier for single-tier price ID', () => {
      // Single-tier pricing: all price IDs map to 'premium' tier
      const getTierFromPriceIdFn = require('../../config/stripe').getTierFromPriceId;
      const singlePriceId = 'price_single_tier_test';
      expect(getTierFromPriceIdFn(singlePriceId)).toBe('premium');
    });

    it('should return premium for any valid price ID format', () => {
      // With single-tier pricing, any price ID starting with 'price_' returns 'premium'
      const getTierFromPriceIdFn = require('../../config/stripe').getTierFromPriceId;
      expect(getTierFromPriceIdFn('price_any_valid_id')).toBe('premium');
    });

    it('should return null for invalid price ID format', () => {
      // Only returns null for non-price IDs (doesn't start with 'price_')
      const getTierFromPriceIdFn = require('../../config/stripe').getTierFromPriceId;
      expect(getTierFromPriceIdFn('invalid_price_id')).toBeNull();
      expect(getTierFromPriceIdFn('not_a_price')).toBeNull();
    });
  });
});

describe('Subscription Plan Features', () => {
  it('should have starter tier with basic features', () => {
    const plans = require('../../types/stripe').SUBSCRIPTION_PLANS;
    const starter = plans.starter;
    expect(starter.features).toContain('Basic financial analysis');
    expect(starter.features).toContain('Account balances');
    expect(starter.features).toContain('Transaction history');
  });

  it('should have standard tier with enhanced features', () => {
    const plans = require('../../types/stripe').SUBSCRIPTION_PLANS;
    const standard = plans.standard;
    expect(standard.features).toContain('Economic indicators');
    expect(standard.features).toContain('RAG system access');
  });

  it('should have premium tier with all features', () => {
    const plans = require('../../types/stripe').SUBSCRIPTION_PLANS;
    const premium = plans.premium;
    expect(premium.features).toContain('Live market data');
    expect(premium.features).toContain('Advanced analytics');
  });
});
