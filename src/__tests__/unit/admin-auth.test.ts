import { Request, Response, NextFunction } from 'express';
import { adminAuth, AuthenticatedRequest } from '../../auth/middleware';

// Mock environment variables
const originalEnv = process.env;

describe('Admin Authentication Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      user: undefined,
      headers: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Authentication Required', () => {
    it('should return 401 when no user is authenticated', () => {
      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required for admin access'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Environment Variable Configuration', () => {
    it('should return 403 when ADMIN_EMAILS is not set', () => {
      delete process.env.ADMIN_EMAILS;
      mockRequest.user = {
        id: 'test-id',
        email: 'admin@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Admin access not configured'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when ADMIN_EMAILS is empty', () => {
      process.env.ADMIN_EMAILS = '';
      mockRequest.user = {
        id: 'test-id',
        email: 'admin@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Admin access not configured'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when ADMIN_EMAILS contains only whitespace', () => {
      process.env.ADMIN_EMAILS = '   ';
      mockRequest.user = {
        id: 'test-id',
        email: 'admin@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Admin access not configured'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Email Access Control', () => {
    it('should allow access for email in ADMIN_EMAILS', () => {
      process.env.ADMIN_EMAILS = 'admin@example.com,another@example.com';
      mockRequest.user = {
        id: 'test-id',
        email: 'admin@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should allow access for email in ADMIN_EMAILS with spaces', () => {
      process.env.ADMIN_EMAILS = ' admin@example.com , another@example.com ';
      mockRequest.user = {
        id: 'test-id',
        email: 'admin@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should allow access for email in ADMIN_EMAILS (case insensitive)', () => {
      process.env.ADMIN_EMAILS = 'ADMIN@EXAMPLE.COM,another@example.com';
      mockRequest.user = {
        id: 'test-id',
        email: 'admin@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should deny access for email not in ADMIN_EMAILS', () => {
      process.env.ADMIN_EMAILS = 'admin@example.com,another@example.com';
      mockRequest.user = {
        id: 'test-id',
        email: 'unauthorized@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Admin access denied'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should deny access for email not in ADMIN_EMAILS (case insensitive)', () => {
      process.env.ADMIN_EMAILS = 'admin@example.com,another@example.com';
      mockRequest.user = {
        id: 'test-id',
        email: 'UNAUTHORIZED@EXAMPLE.COM',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Admin access denied'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Admin Emails', () => {
    it('should allow access for first email in list', () => {
      process.env.ADMIN_EMAILS = 'first@example.com,second@example.com,third@example.com';
      mockRequest.user = {
        id: 'test-id',
        email: 'first@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should allow access for middle email in list', () => {
      process.env.ADMIN_EMAILS = 'first@example.com,second@example.com,third@example.com';
      mockRequest.user = {
        id: 'test-id',
        email: 'second@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should allow access for last email in list', () => {
      process.env.ADMIN_EMAILS = 'first@example.com,second@example.com,third@example.com';
      mockRequest.user = {
        id: 'test-id',
        email: 'third@example.com',
        tier: 'premium'
      };

      adminAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });
}); 