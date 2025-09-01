// SnapTrade integration using official SDK
import { Snaptrade } from 'snaptrade-typescript-sdk';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

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

// Initialize SnapTrade client
const snaptrade = new Snaptrade({
  consumerKey: credentials.consumerKey,
  clientId: credentials.clientId,
});

// Enhanced SnapTrade service class using official SDK
export class SnapTradeService {
  
  // Health check using official SDK
  async healthCheck(): Promise<boolean> {
    try {
      const status = await snaptrade.apiStatus.check();
      console.log('SnapTrade API Status:', status.data);
      return true;
    } catch (error) {
      console.error('SnapTrade health check failed:', error);
      return false;
    }
  }

  // Register user using official SDK
  async registerUser(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Registering SnapTrade user:', userId);
      
      // Register user with SnapTrade
      const registration = await snaptrade.authentication.registerSnapTradeUser({
        userId,
      });
      
      const userSecret = registration.data.userSecret;
      console.log('🔍 SnapTrade registration successful, userSecret generated');
      
      // Store in database
      const db = getPrismaClient();
      await db.snapTradeUser.create({
        data: {
          userId: userId,
          snapTradeUserId: userId, // SnapTrade uses our userId
          userSecret: userSecret,
          status: 'registered'
        }
      });
      
      console.log('🔍 User stored in database successfully');
      
      return { 
        success: true, 
        data: {
          userId: userId,
          userSecret: userSecret,
          status: 'registered'
        }
      };
    } catch (error) {
      console.error('SnapTrade user registration failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Registration failed' };
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
          userSecret: user.userSecret,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      };
    } catch (error) {
      console.error('SnapTrade get user status failed:', error);
      return { success: false, error: 'Database error' };
    }
  }

  // Get login redirect URI
  async getLoginRedirect(userId: string, userSecret: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Getting login redirect for user:', userId);
      
      const loginData = await snaptrade.authentication.loginSnapTradeUser({ 
        userId, 
        userSecret 
      });
      
      if (!('redirectURI' in loginData.data)) {
        throw new Error('No redirect URI received from SnapTrade');
      }
      
      console.log('🔍 Login redirect URI obtained');
      
      return { 
        success: true, 
        data: {
          redirectURI: loginData.data.redirectURI
        }
      };
    } catch (error) {
      console.error('SnapTrade login redirect failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Login redirect failed' };
    }
  }

  // Get user holdings
  async getUserHoldings(userId: string, userSecret: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Getting holdings for user:', userId);
      
      const holdings = await snaptrade.accountInformation.getAllUserHoldings({
        userId,
        userSecret,
      });
      
      console.log('🔍 Holdings retrieved successfully');
      
      return { 
        success: true, 
        data: holdings.data
      };
    } catch (error) {
      console.error('SnapTrade get holdings failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Get holdings failed' };
    }
  }

  // Delete user
  async deleteUser(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Deleting SnapTrade user:', userId);
      
      const deleteResponse = await snaptrade.authentication.deleteSnapTradeUser({ 
        userId 
      });
      
      // Also delete from our database
      const db = getPrismaClient();
      await db.snapTradeUser.delete({
        where: { userId }
      });
      
      console.log('🔍 User deleted successfully');
      
      return { 
        success: true, 
        data: deleteResponse.data
      };
    } catch (error) {
      console.error('SnapTrade delete user failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Delete user failed' };
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
  
  snapTradeService.getLoginRedirect = async (userId: string, userSecret: string) => {
    console.log('SnapTrade: Mock getLoginRedirect called with:', userId);
    return {
      success: true,
      data: {
        redirectURI: 'https://mock-snaptrade.com/connect'
      }
    };
  };
  
  snapTradeService.getUserHoldings = async (userId: string, userSecret: string) => {
    console.log('SnapTrade: Mock getUserHoldings called with:', userId);
    return {
      success: true,
      data: {
        holdings: [
          {
            id: 'mock-holding-1',
            accountId: 'mock-account-1',
            symbol: 'AAPL',
            quantity: 10,
            price: 150.00,
            value: 1500.00
          }
        ]
      }
    };
  };
  
  snapTradeService.deleteUser = async (userId: string) => {
    console.log('SnapTrade: Mock deleteUser called with:', userId);
    return {
      success: true,
      data: {
        message: 'User deleted successfully'
      }
    };
  };
}
