/**
 * Subscription Configuration
 * 
 * This file contains configuration for the subscription fix script.
 * Update these values to match your Stripe setup.
 */

module.exports = {
  // Stripe Price ID to Tier Mapping
  // Update these with your actual Stripe price IDs
  priceToTierMap: {
    'price_1RwzrlBDHiWEJZBMbLKSPb3N': 'standard',  // Standard plan
    'price_1RwzscBDHiWEJZBMZGIIztNB': 'premium',    // Premium plan
    'price_1RwzpgBDHiWEJZBMLFM6vTwr': 'starter'   // Starter plan
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

  // Default tier when mapping fails
  defaultTier: 'standard',

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
