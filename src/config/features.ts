export interface FeatureFlags {
  USER_AUTH: boolean;
  TIER_ENFORCEMENT: boolean;
  DEMO_MODE: boolean;
  PLAID_ENRICH: boolean;
}

export const getFeatures = (): FeatureFlags => ({
  USER_AUTH: process.env.ENABLE_USER_AUTH === 'true',
  TIER_ENFORCEMENT: process.env.ENABLE_TIER_ENFORCEMENT === 'true',
  DEMO_MODE: true, // Always enabled
  PLAID_ENRICH: process.env.ENABLE_PLAID_ENRICH === 'true' // Default: false (use simple categories)
});

export const FEATURES = getFeatures();

export const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
  return getFeatures()[feature];
};

export const requireFeature = (feature: keyof FeatureFlags): void => {
  if (!isFeatureEnabled(feature)) {
    throw new Error(`Feature ${feature} is not enabled`);
  }
}; 