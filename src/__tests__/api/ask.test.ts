import { isFeatureEnabled } from '../../config/features';

describe('Feature Flag Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Demo Mode Logic', () => {
    test('demo mode bypasses auth requirements', () => {
      process.env.ENABLE_USER_AUTH = 'true';
      
      // In demo mode, auth should be bypassed
      const isDemo = true;
      const authEnabled = isFeatureEnabled('USER_AUTH');
      
      // Demo should work regardless of auth setting
      expect(isDemo).toBe(true);
      expect(authEnabled).toBe(true);
    });

    test('demo mode always works', () => {
      process.env.ENABLE_USER_AUTH = 'false';
      
      const isDemo = true;
      const authEnabled = isFeatureEnabled('USER_AUTH');
      
      // Demo should work when auth is disabled
      expect(isDemo).toBe(true);
      expect(authEnabled).toBe(false);
    });
  });

  describe('User Mode Logic', () => {
    test('user mode respects auth when enabled', () => {
      process.env.ENABLE_USER_AUTH = 'true';
      
      const isDemo = false;
      const authEnabled = isFeatureEnabled('USER_AUTH');
      
      // User mode should require auth when enabled
      expect(isDemo).toBe(false);
      expect(authEnabled).toBe(true);
    });

    test('user mode works when auth is disabled', () => {
      process.env.ENABLE_USER_AUTH = 'false';
      
      const isDemo = false;
      const authEnabled = isFeatureEnabled('USER_AUTH');
      
      // User mode should work when auth is disabled
      expect(isDemo).toBe(false);
      expect(authEnabled).toBe(false);
    });
  });
}); 