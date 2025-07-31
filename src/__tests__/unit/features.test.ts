import { getFeatures, isFeatureEnabled, requireFeature } from '../../config/features';

describe('Feature Flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DEMO_MODE', () => {
    test('demo mode is always enabled', () => {
      expect(getFeatures().DEMO_MODE).toBe(true);
      expect(isFeatureEnabled('DEMO_MODE')).toBe(true);
    });
  });

  describe('USER_AUTH', () => {
    test('user auth is disabled by default', () => {
      delete process.env.ENABLE_USER_AUTH;
      expect(getFeatures().USER_AUTH).toBe(false);
    });

    test('user auth can be enabled via environment variable', () => {
      process.env.ENABLE_USER_AUTH = 'true';
      expect(getFeatures().USER_AUTH).toBe(true);
    });

    test('user auth is disabled when environment variable is false', () => {
      process.env.ENABLE_USER_AUTH = 'false';
      expect(getFeatures().USER_AUTH).toBe(false);
    });
  });

  describe('TIER_ENFORCEMENT', () => {
    test('tier enforcement is disabled by default', () => {
      delete process.env.ENABLE_TIER_ENFORCEMENT;
      expect(getFeatures().TIER_ENFORCEMENT).toBe(false);
    });

    test('tier enforcement can be enabled via environment variable', () => {
      process.env.ENABLE_TIER_ENFORCEMENT = 'true';
      expect(getFeatures().TIER_ENFORCEMENT).toBe(true);
    });
  });

  describe('requireFeature', () => {
    test('throws error when feature is disabled', () => {
      process.env.ENABLE_USER_AUTH = 'false';
      expect(() => requireFeature('USER_AUTH')).toThrow('Feature USER_AUTH is not enabled');
    });

    test('does not throw when feature is enabled', () => {
      process.env.ENABLE_USER_AUTH = 'true';
      expect(() => requireFeature('USER_AUTH')).not.toThrow();
    });
  });
}); 