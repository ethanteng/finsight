import { generateRandomCode, generateRandomToken } from '../../auth/email';

describe('Email Service', () => {
  describe('generateRandomCode', () => {
    it('should generate a 6-digit code', () => {
      const code = generateRandomCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate different codes on multiple calls', () => {
      const code1 = generateRandomCode();
      const code2 = generateRandomCode();
      expect(code1).not.toBe(code2);
    });

    it('should generate codes within valid range', () => {
      const code = generateRandomCode();
      const numCode = parseInt(code);
      expect(numCode).toBeGreaterThanOrEqual(100000);
      expect(numCode).toBeLessThanOrEqual(999999);
    });
  });

  describe('generateRandomToken', () => {
    it('should generate a token string', () => {
      const token = generateRandomToken();
      expect(token).toMatch(/^[a-z0-9]+$/);
      expect(token.length).toBeGreaterThan(20);
    });

    it('should generate different tokens on multiple calls', () => {
      const token1 = generateRandomToken();
      const token2 = generateRandomToken();
      expect(token1).not.toBe(token2);
    });
  });
}); 