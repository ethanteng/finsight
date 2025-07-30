import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { hashPassword, generateToken, verifyToken } from '../../auth/utils';
import { authenticateUser } from '../../auth/middleware';

// Mock the main app for testing
const mockApp = {
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  use: jest.fn()
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  privacySettings: {
    create: jest.fn()
  }
};

// Mock the getPrismaClient function
jest.mock('../../index', () => ({
  getPrismaClient: () => mockPrisma
}));

describe('Authentication System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Password Utilities', () => {
    test('should hash password correctly', async () => {
      const password = 'TestPassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    test('should verify password correctly', async () => {
      const password = 'TestPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await import('../../auth/utils').then(utils => 
        utils.comparePassword(password, hash)
      );
      
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const password = 'TestPassword123';
      const wrongPassword = 'WrongPassword123';
      const hash = await hashPassword(password);
      
      const isValid = await import('../../auth/utils').then(utils => 
        utils.comparePassword(wrongPassword, hash)
      );
      
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Utilities', () => {
    test('should generate valid token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        tier: 'starter'
      };
      
      const token = generateToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    test('should verify valid token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        tier: 'starter'
      };
      
      const token = generateToken(payload);
      const verified = verifyToken(token);
      
      expect(verified).toBeDefined();
      expect(verified).toMatchObject(payload);
    });

    test('should reject invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const verified = verifyToken(invalidToken);
      
      expect(verified).toBeNull();
    });
  });

  describe('Email Validation', () => {
    test('should validate correct email formats', async () => {
      const { validateEmail } = await import('../../auth/utils');
      
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
    });

    test('should reject invalid email formats', async () => {
      const { validateEmail } = await import('../../auth/utils');
      
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('Password Validation', () => {
    test('should validate strong passwords', async () => {
      const { validatePassword } = await import('../../auth/utils');
      
      const result = validatePassword('StrongPass123');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should reject weak passwords', async () => {
      const { validatePassword } = await import('../../auth/utils');
      
      // Too short
      expect(validatePassword('Abc1')).toEqual({
        isValid: false,
        error: 'Password must be at least 8 characters long'
      });
      
      // No uppercase
      expect(validatePassword('password123')).toEqual({
        isValid: false,
        error: 'Password must contain at least one uppercase letter'
      });
      
      // No lowercase
      expect(validatePassword('PASSWORD123')).toEqual({
        isValid: false,
        error: 'Password must contain at least one lowercase letter'
      });
      
      // No number
      expect(validatePassword('Password')).toEqual({
        isValid: false,
        error: 'Password must contain at least one number'
      });
    });
  });
});

describe('Authentication Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  test('should reject request without token', async () => {
    await authenticateUser(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should reject request with invalid token', async () => {
    mockReq.headers.authorization = 'Bearer invalid.token.here';
    
    await authenticateUser(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should accept request with valid token', async () => {
    const payload = {
      userId: 'test-user-id',
      email: 'test@example.com',
      tier: 'starter'
    };
    const token = generateToken(payload);
    
    mockReq.headers.authorization = `Bearer ${token}`;
    
    // Mock user lookup
    mockPrisma.user.findUnique.mockResolvedValue({
      id: payload.userId,
      email: payload.email,
      tier: payload.tier,
      isActive: true
    });
    
    await authenticateUser(mockReq, mockRes, mockNext);
    
    expect(mockReq.user).toMatchObject({
      id: payload.userId,
      email: payload.email,
      tier: payload.tier
    });
    expect(mockNext).toHaveBeenCalled();
  });

  test('should reject request for deactivated user', async () => {
    const payload = {
      userId: 'test-user-id',
      email: 'test@example.com',
      tier: 'starter'
    };
    const token = generateToken(payload);
    
    mockReq.headers.authorization = `Bearer ${token}`;
    
    // Mock deactivated user
    mockPrisma.user.findUnique.mockResolvedValue({
      id: payload.userId,
      email: payload.email,
      tier: payload.tier,
      isActive: false
    });
    
    await authenticateUser(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found or account deactivated' });
    expect(mockNext).not.toHaveBeenCalled();
  });
}); 