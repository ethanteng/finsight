import { Response, NextFunction } from 'express';
import {
  authenticateUser,
  requireAuthAllowLapsedSubscription,
  AuthenticatedRequest
} from '../../auth/middleware';
import { getPrismaClient } from '../../prisma-client';

jest.mock('../../auth/utils', () => ({
  verifyToken: jest.fn().mockReturnValue({
    userId: 'user_123',
    email: 'lapsed@example.com',
    tier: 'premium'
  }),
  extractTokenFromHeader: jest.fn().mockReturnValue('token_123')
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn()
}));

describe('Lapsed subscriber authentication', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    (getPrismaClient as jest.Mock).mockReturnValue({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_123',
          email: 'lapsed@example.com',
          tier: 'premium',
          isActive: true,
          subscriptionStatus: 'canceled'
        })
      }
    });

    mockRequest = { headers: { authorization: 'Bearer token_123' } };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  it('blocks a canceled subscriber from ordinary authenticated routes', async () => {
    await authenticateUser(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Subscription expired. Please renew to continue.'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('lets a canceled subscriber through on billing routes so they can resubscribe', async () => {
    await requireAuthAllowLapsedSubscription(
      mockRequest as AuthenticatedRequest,
      mockResponse as Response,
      mockNext
    );

    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
    expect(mockRequest.user).toEqual({
      id: 'user_123',
      email: 'lapsed@example.com',
      tier: 'premium'
    });
  });

  it('still rejects a deactivated account on billing routes', async () => {
    (getPrismaClient as jest.Mock).mockReturnValue({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_123',
          email: 'lapsed@example.com',
          tier: 'premium',
          isActive: false,
          subscriptionStatus: 'canceled'
        })
      }
    });

    await requireAuthAllowLapsedSubscription(
      mockRequest as AuthenticatedRequest,
      mockResponse as Response,
      mockNext
    );

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
