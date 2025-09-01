// Basic SnapTrade configuration
// This is a minimal setup for incremental development

import { PrismaClient } from '@prisma/client';

// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma: PrismaClient | null = null;

const getPrismaClient = () => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

// Determine SnapTrade mode from environment variable
const snapTradeMode = process.env.SNAPTRADE_MODE || 'sandbox';
const useSandbox = snapTradeMode === 'sandbox';

// Select appropriate environment variables based on mode
const getSnapTradeCredentials = () => {
  if (snapTradeMode === 'production') {
    return {
      clientId: process.env.SNAPTRADE_CLIENT_ID_PROD || process.env.SNAPTRADE_CLIENT_ID,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY_PROD || process.env.SNAPTRADE_CONSUMER_KEY,
      env: process.env.SNAPTRADE_ENV_PROD || 'production'
    };
  } else {
    return {
      clientId: process.env.SNAPTRADE_CLIENT_ID,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
      env: 'sandbox'
    };
  }
};

const credentials = getSnapTradeCredentials();

// Log SnapTrade environment configuration
console.log('SnapTrade Configuration:', {
  mode: snapTradeMode,
  environment: useSandbox ? 'sandbox' : credentials.env,
  hasClientId: !!credentials.clientId,
  hasConsumerKey: !!credentials.consumerKey,
  useSandbox: useSandbox,
  isProduction: snapTradeMode === 'production',
  credentialsSource: snapTradeMode === 'production' ? 'production variables' : 'sandbox variables'
});

// Basic SnapTrade service class
export class SnapTradeService {
  private clientId: string;
  private consumerKey: string;
  private baseUrl: string;

  constructor() {
    this.clientId = credentials.clientId || '';
    this.consumerKey = credentials.consumerKey || '';
    this.baseUrl = useSandbox 
      ? 'https://api.sandbox.snaptrade.com' 
      : 'https://api.snaptrade.com';
  }

  // Basic health check method
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'SNAPTRADE-CLIENT-ID': this.clientId,
          'SNAPTRADE-CONSUMER-KEY': this.consumerKey,
        },
      });
      return response.ok;
    } catch (error) {
      console.error('SnapTrade health check failed:', error);
      return false;
    }
  }

  // Basic user registration method
  async registerUser(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/authorizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'SNAPTRADE-CLIENT-ID': this.clientId,
          'SNAPTRADE-CONSUMER-KEY': this.consumerKey,
        },
        body: JSON.stringify({
          userId: userId,
          userSecret: `secret_${userId}`, // This will be generated properly later
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Store in database
        const db = getPrismaClient();
        await db.snapTradeUser.create({
          data: {
            userId: userId,
            snapTradeUserId: data.userId || userId,
            userSecret: data.userSecret || `secret_${userId}`,
            status: 'registered'
          }
        });
        
        return { success: true, data };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.message || 'Registration failed' };
      }
    } catch (error) {
      console.error('SnapTrade user registration failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Get user status from database
  async getUserStatus(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const db = getPrismaClient();
      const user = await db.snapTradeUser.findUnique({
        where: { userId }
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return { 
        success: true, 
        data: {
          status: user.status,
          snapTradeUserId: user.snapTradeUserId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      };
    } catch (error) {
      console.error('SnapTrade get user status failed:', error);
      return { success: false, error: 'Database error' };
    }
  }
}

// Export a singleton instance
export const snapTradeService = new SnapTradeService();

// Safety check: Prevent real SnapTrade API calls in test/CI environments
if (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) {
  console.log('SnapTrade: Test/CI environment detected - using mock responses');
  
  // Override methods to return mock data in test environment
  snapTradeService.healthCheck = async () => {
    console.log('SnapTrade: Mock healthCheck called');
    return true;
  };
  
  snapTradeService.registerUser = async (userId: string) => {
    console.log('SnapTrade: Mock registerUser called with:', userId);
    return {
      success: true,
      data: {
        userId: userId,
        userSecret: `mock_secret_${userId}`,
        status: 'registered'
      }
    };
  };
}
