/**
 * Subscription Configuration
 * 
 * This file contains configuration for the subscription fix script.
 * Update these values to match your Stripe setup.
 */

module.exports = {
  // Stripe Price ID to Tier Mapping
  // Single-tier pricing: all price IDs map to 'premium' tier (the single plan is the old premium plan)
  priceToTierMap: {
    'price_1SyeXEBDHiWEJZBMAu9P57zI': 'premium',  // Single price for all tiers ($9/month, prod_SraoEdrNSHuQ1W)
    // Legacy price IDs - map to premium for backward compatibility
    'price_1RwzrlBDHiWEJZBMbLKSPb3N': 'premium',
    'price_1RwzscBDHiWEJZBMZGIIztNB': 'premium',
    'price_1RwzpgBDHiWEJZBMLFM6vTwr': 'premium'
  },

  // Price Nickname to Tier Mapping (fallback)
  // This is used when price ID mapping fails
  nicknameToTierMap: {
    'premium': 'premium',
    'standard': 'standard', 
    'starter': 'starter',
    'basic': 'starter',
    'pro': 'premium',
    'enterprise': 'premium'
  },

  // Default tier when mapping fails (single plan is the old premium plan)
  defaultTier: 'premium',

  // Logging configuration
  logging: {
    showVerboseByDefault: false,
    showTimestamps: true,
    showProgressBars: true
  },

  // Database configuration
  database: {
    maxRetries: 3,
    retryDelay: 1000, // milliseconds
    timeout: 30000 // milliseconds
  },

  // Stripe configuration
  stripe: {
    maxCustomersToFetch: 10,
    maxSubscriptionsToFetch: 10,
    timeout: 30000 // milliseconds
  }
};
