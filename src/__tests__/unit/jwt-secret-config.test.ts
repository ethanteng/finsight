import {
  assertJwtSecretConfigured,
  generateToken,
  verifyToken,
} from '../../auth/utils';

/**
 * The fallback secret is committed to this repository. A production deploy
 * that still signs with it lets anyone mint a session for any user id, so
 * these tests pin the refusal rather than the convenience.
 */
const PUBLIC_FALLBACK = 'your-secret-key-change-in-production';

describe('JWT secret configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  describe('in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('refuses to boot when JWT_SECRET is unset', () => {
      delete process.env.JWT_SECRET;
      expect(() => assertJwtSecretConfigured()).toThrow(/JWT_SECRET/);
    });

    it('refuses to boot when JWT_SECRET is still the public default', () => {
      process.env.JWT_SECRET = PUBLIC_FALLBACK;
      expect(() => assertJwtSecretConfigured()).toThrow(/public default/);
    });

    it('refuses to boot when JWT_SECRET is only whitespace', () => {
      process.env.JWT_SECRET = '   ';
      expect(() => assertJwtSecretConfigured()).toThrow(/JWT_SECRET/);
    });

    it('refuses to sign or verify a token rather than falling back', () => {
      delete process.env.JWT_SECRET;
      const payload = { userId: 'u1', email: 'a@b.com', tier: 'starter' };

      expect(() => generateToken(payload)).toThrow(/JWT_SECRET/);
      // Verification must throw too. Returning null would look like an ordinary
      // expired session and hide the misconfiguration behind a 401.
      expect(() => verifyToken('any.token.value')).toThrow(/JWT_SECRET/);
    });

    it('accepts a configured secret and round-trips a token', () => {
      process.env.JWT_SECRET = 'a-real-production-secret-of-sufficient-length';
      expect(() => assertJwtSecretConfigured()).not.toThrow();

      const token = generateToken({ userId: 'u1', email: 'a@b.com', tier: 'premium' });
      expect(verifyToken(token)).toMatchObject({ userId: 'u1', tier: 'premium' });
    });

    it('warns but still boots when a real secret is short', () => {
      process.env.JWT_SECRET = 'short-secret';
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => assertJwtSecretConfigured()).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET is only'));

      warn.mockRestore();
    });
  });

  describe('outside production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('keeps working without JWT_SECRET so local setup needs no configuration', () => {
      delete process.env.JWT_SECRET;
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => assertJwtSecretConfigured()).not.toThrow();
      const token = generateToken({ userId: 'u1', email: 'a@b.com', tier: 'starter' });
      expect(verifyToken(token)).toMatchObject({ userId: 'u1' });

      warn.mockRestore();
    });

    it('does not verify a token signed with a different secret', () => {
      process.env.JWT_SECRET = 'secret-one-used-for-signing';
      const token = generateToken({ userId: 'u1', email: 'a@b.com', tier: 'starter' });

      process.env.JWT_SECRET = 'secret-two-used-for-verifying';
      expect(verifyToken(token)).toBeNull();
    });
  });
});
