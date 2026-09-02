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
  
  // Single-tier pricing: one configured price ID backs every tier.
  process.env.STRIPE_PRICE_DEFAULT = 'price_single_tier_test';
  delete process.env.STRIPE_PRICE_STARTER;
  delete process.env.STRIPE_PRICE_STANDARD;
  delete process.env.STRIPE_PRICE_PREMIUM;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('Stripe Configuration', () => {
  // Dynamically import modules after env vars are set
  let TIER_ACCESS: any;
  let getStripePriceId: any;
  let getTierFromPriceId: any;

  beforeAll(() => {
    // Import modules after env vars are set in beforeEach
    const stripeTypes = require('../../types/stripe');
    const stripeConfig = require('../../config/stripe');
    TIER_ACCESS = stripeTypes.TIER_ACCESS;
    getStripePriceId = stripeConfig.getStripePriceId;
    getTierFromPriceId = stripeConfig.getTierFromPriceId;
  });

  describe('getSubscriptionPlans', () => {
    it('should have all three subscription tiers', () => {
      const plans = require('../../types/stripe').getSubscriptionPlans();
      expect(plans).toHaveProperty('starter');
      expect(plans).toHaveProperty('standard');
      expect(plans).toHaveProperty('premium');
    });

    it('should fall back to the advertised price for each tier', () => {
      // Single-tier pricing: every tier bills the same price. The amount here is
      // only the offline fallback; live amounts come from getLiveSubscriptionPlans.
      const { getSubscriptionPlans, FALLBACK_MONTHLY_PRICE } = require('../../types/stripe');
      const plans = getSubscriptionPlans();
      expect(FALLBACK_MONTHLY_PRICE).toBe(19);
      expect(plans.starter.price).toBe(FALLBACK_MONTHLY_PRICE);
      expect(plans.standard.price).toBe(FALLBACK_MONTHLY_PRICE);
      expect(plans.premium.price).toBe(FALLBACK_MONTHLY_PRICE);
    });

    it('should have monthly billing interval', () => {
      const plans = require('../../types/stripe').getSubscriptionPlans();
      Object.values(plans).forEach((plan: any) => {
        expect(plan.interval).toBe('month');
      });
    });

    it('should have USD currency', () => {
      const plans = require('../../types/stripe').getSubscriptionPlans();
      Object.values(plans).forEach((plan: any) => {
        expect(plan.currency).toBe('usd');
      });
    });

    it('should have features for each tier', () => {
      const plans = require('../../types/stripe').getSubscriptionPlans();
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
      expect(premiumFeatures).toContain('advanced-market-context');
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

  describe('resolveCheckoutSessionTier', () => {
    it('prefers verified session metadata over line-item price', () => {
      const resolveCheckoutSessionTier = require('../../config/stripe').resolveCheckoutSessionTier;
      expect(resolveCheckoutSessionTier({
        metadata: { tier: ' Standard ' },
        line_items: { data: [{ price: { id: 'price_any_valid_id' } }] },
      })).toBe('standard');
    });

    it('falls back to the line-item price when metadata is missing', () => {
      const resolveCheckoutSessionTier = require('../../config/stripe').resolveCheckoutSessionTier;
      expect(resolveCheckoutSessionTier({
        metadata: {},
        line_items: { data: [{ price: { id: 'price_any_valid_id' } }] },
      })).toBe('premium');
    });

    it('ignores unknown metadata and defaults to premium with no price', () => {
      const resolveCheckoutSessionTier = require('../../config/stripe').resolveCheckoutSessionTier;
      expect(resolveCheckoutSessionTier({
        metadata: { tier: 'enterprise' },
        line_items: { data: [] },
      })).toBe('premium');
    });
  });
});

describe('Subscription Plan Features', () => {
  it('should have starter tier with basic features', () => {
    const plans = require('../../types/stripe').getSubscriptionPlans();
    const starter = plans.starter;
    expect(starter.features).toContain('Basic financial analysis');
    expect(starter.features).toContain('Account balances');
    expect(starter.features).toContain('Transaction history');
  });

  it('should have standard tier with enhanced features', () => {
    const plans = require('../../types/stripe').getSubscriptionPlans();
    const standard = plans.standard;
    expect(standard.features).toContain('Economic indicators');
    expect(standard.features).toContain('RAG system access');
  });

  it('should have premium tier with all features', () => {
    const plans = require('../../types/stripe').getSubscriptionPlans();
    const premium = plans.premium;
    expect(premium.features).toContain('Advanced market context');
    expect(premium.features).toContain('Advanced analytics');
  });
});
