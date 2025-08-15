import { 
  SUBSCRIPTION_PLANS, 
  SubscriptionTier, 
  TIER_ACCESS
} from '../../types/stripe';
import { 
  getStripePriceId,
  getTierFromPriceId 
} from '../../config/stripe';

// Mock environment variables for testing
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
  
  // Set test environment variables
  process.env.STRIPE_PRICE_STARTER = 'price_starter_test';
  process.env.STRIPE_PRICE_STANDARD = 'price_standard_test';
  process.env.STRIPE_PRICE_PREMIUM = 'price_premium_test';
});

afterEach(() => {
  process.env = originalEnv;
});

describe('Stripe Configuration', () => {
  describe('SUBSCRIPTION_PLANS', () => {
    it('should have all three subscription tiers', () => {
      expect(SUBSCRIPTION_PLANS).toHaveProperty('starter');
      expect(SUBSCRIPTION_PLANS).toHaveProperty('standard');
      expect(SUBSCRIPTION_PLANS).toHaveProperty('premium');
    });

    it('should have correct pricing for each tier', () => {
      expect(SUBSCRIPTION_PLANS.starter.price).toBe(9.99);
      expect(SUBSCRIPTION_PLANS.standard.price).toBe(19.99);
      expect(SUBSCRIPTION_PLANS.premium.price).toBe(39.99);
    });

    it('should have monthly billing interval', () => {
      Object.values(SUBSCRIPTION_PLANS).forEach(plan => {
        expect(plan.interval).toBe('month');
      });
    });

    it('should have USD currency', () => {
      Object.values(SUBSCRIPTION_PLANS).forEach(plan => {
        expect(plan.currency).toBe('usd');
      });
    });

    it('should have features for each tier', () => {
      Object.values(SUBSCRIPTION_PLANS).forEach(plan => {
        expect(plan.features).toBeInstanceOf(Array);
        expect(plan.features.length).toBeGreaterThan(0);
      });
    });
  });

  describe('TIER_ACCESS', () => {
    it('should define access levels for each tier', () => {
      expect(TIER_ACCESS).toHaveProperty('starter');
      expect(TIER_ACCESS).toHaveProperty('standard');
      expect(TIER_ACCESS).toHaveProperty('premium');
    });

    it('should have progressive access levels', () => {
      const starterFeatures = TIER_ACCESS.starter;
      const standardFeatures = TIER_ACCESS.standard;
      const premiumFeatures = TIER_ACCESS.premium;

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
      expect(TIER_ACCESS.starter.length).toBeLessThan(TIER_ACCESS.standard.length);
      expect(TIER_ACCESS.standard.length).toBeLessThan(TIER_ACCESS.premium.length);
    });
  });

  describe('getStripePriceId', () => {
    it('should return correct price ID for valid tier', () => {
      expect(getStripePriceId('starter')).toBe('price_starter_test');
      expect(getStripePriceId('standard')).toBe('price_standard_test');
      expect(getStripePriceId('premium')).toBe('price_premium_test');
    });

    it('should throw error for invalid tier', () => {
      expect(() => getStripePriceId('invalid' as SubscriptionTier)).toThrow('Invalid subscription tier: invalid');
    });
  });

  describe('getTierFromPriceId', () => {
    it('should return correct tier for valid price ID', () => {
      expect(getTierFromPriceId('price_starter_test')).toBe('starter');
      expect(getTierFromPriceId('price_standard_test')).toBe('standard');
      expect(getTierFromPriceId('price_premium_test')).toBe('premium');
    });

    it('should return null for invalid price ID', () => {
      expect(getTierFromPriceId('price_invalid')).toBeNull();
    });
  });
});

describe('Subscription Plan Features', () => {
  it('should have starter tier with basic features', () => {
    const starter = SUBSCRIPTION_PLANS.starter;
    expect(starter.features).toContain('Basic financial analysis');
    expect(starter.features).toContain('Account balances');
    expect(starter.features).toContain('Transaction history');
  });

  it('should have standard tier with enhanced features', () => {
    const standard = SUBSCRIPTION_PLANS.standard;
    expect(standard.features).toContain('Economic indicators');
    expect(standard.features).toContain('RAG system access');
  });

  it('should have premium tier with all features', () => {
    const premium = SUBSCRIPTION_PLANS.premium;
    expect(premium.features).toContain('Live market data');
    expect(premium.features).toContain('Advanced analytics');
  });
});
