import jwt from 'jsonwebtoken';

export class SecurityTestUtils {
  /**
   * Generate a test JWT token for testing authentication
   */
  static generateTestToken(
    userId: string, 
    email: string, 
    expiresInHours: number = 1
  ): string {
    const jwtSecret = process.env.JWT_SECRET || 'test-secret';
    const payload = {
      userId,
      email,
      tier: 'starter',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (expiresInHours * 3600)
    };
    
    return jwt.sign(payload, jwtSecret);
  }
  
  /**
   * Create a test user object for testing
   */
  static createTestUser(id: string, email: string, tier: string = 'starter') {
    return {
      id,
      email,
      tier,
      isActive: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  /**
   * Mock database with multiple users for testing user isolation
   */
  static mockDatabaseWithMultipleUsers(mockPrisma: any, users: any[]) {
    // Mock access tokens for multiple users
    const allTokens = users.flatMap(user => [
      { id: `token-${user.id}`, userId: user.id, token: `plaid-token-${user.id}` }
    ]);
    
    mockPrisma.accessToken.findMany.mockResolvedValue(allTokens);
    
    // Mock user data
    users.forEach(user => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(user);
    });
  }
  
  /**
   * Create test access token for a user
   */
  static createTestAccessToken(userId: string, token: string = 'test-token') {
    return {
      id: `token-${userId}`,
      userId,
      token,
      itemId: `item-${userId}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  /**
   * Generate expired token for testing token expiration
   */
  static generateExpiredToken(userId: string, email: string): string {
    const jwtSecret = process.env.JWT_SECRET || 'test-secret';
    const payload = {
      userId,
      email,
      tier: 'starter',
      iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
      exp: Math.floor(Date.now() / 1000) - 3600  // 1 hour ago (expired)
    };
    
    return jwt.sign(payload, jwtSecret);
  }
  
  /**
   * Generate invalid token for testing token validation
   */
  static generateInvalidToken(): string {
    return 'invalid.token.here';
  }
}
