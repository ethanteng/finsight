import { isFeatureEnabled } from '../../config/features';

describe('Feature Flag Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('User Mode Logic', () => {
    test('user mode respects auth when enabled', () => {
      process.env.ENABLE_USER_AUTH = 'true';

      const authEnabled = isFeatureEnabled('USER_AUTH');

      // User mode should require auth when enabled
      expect(authEnabled).toBe(true);
    });

    test('user mode works when auth is disabled', () => {
      process.env.ENABLE_USER_AUTH = 'false';

      const authEnabled = isFeatureEnabled('USER_AUTH');

      // User mode should work when auth is disabled
      expect(authEnabled).toBe(false);
    });
  });
});
