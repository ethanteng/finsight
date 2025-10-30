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
      
      // Check if credentials are available
      if (!credentials.clientId || !credentials.consumerKey) {
        const missingVars = [];
        if (!credentials.clientId) missingVars.push('SNAPTRADE_CLIENT_ID' + (snapTradeMode === 'production' ? '_PROD' : ''));
        if (!credentials.consumerKey) missingVars.push('SNAPTRADE_CONSUMER_KEY' + (snapTradeMode === 'production' ? '_PROD' : ''));
        
        const errorMsg = `SnapTrade credentials not configured. Missing: ${missingVars.join(', ')}`;
        console.error('❌', errorMsg);
        return { success: false, error: errorMsg };
      }
      
      // Check if user already exists in our database
      const db = getPrismaClient();
      const existingUser = await db.snapTradeUser.findUnique({
        where: { userId: userId }
      });
      
      if (existingUser) {
        console.log('🔍 User already exists in database, returning existing data');
        return { 
          success: true, 
          data: {
            userId: existingUser.userId,
            userSecret: existingUser.userSecret,
            status: existingUser.status
          }
        };
      }
      
      // Register user with SnapTrade
      const registration = await snaptrade.authentication.registerSnapTradeUser({
        userId,
      });
      
      const userSecret = registration.data.userSecret;
      console.log('🔍 SnapTrade registration successful, userSecret generated');
      
      if (!userSecret) {
        throw new Error('No userSecret received from SnapTrade registration');
      }
      
      // Store in database
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
      
      // Handle specific error cases
      if (error instanceof Error) {
        // Check if user already exists in SnapTrade
        if (error.message.includes('User with the following userId already exist')) {
          console.log('🔍 User already exists in SnapTrade, checking if we have the userSecret');
          
          // Try to get the user status to see if we can retrieve the userSecret
          try {
            const db = getPrismaClient();
            const existingUser = await db.snapTradeUser.findUnique({
              where: { userId: userId }
            });
            
            if (existingUser) {
              console.log('🔍 Found existing user in database');
              return { 
                success: true, 
                data: {
                  userId: existingUser.userId,
                  userSecret: existingUser.userSecret,
                  status: existingUser.status
                }
              };
            } else {
              // User exists in SnapTrade but not in our database
              // This is a problem - we need to either delete the SnapTrade user or get the userSecret
              console.log('⚠️ User exists in SnapTrade but not in our database');
              return { 
                success: false, 
                error: 'User exists in SnapTrade but not in our database. Please contact support or try deleting the SnapTrade user first.'
              };
            }
          } catch (dbError) {
            console.error('Database error while checking existing user:', dbError);
            return { 
              success: false, 
              error: 'User already exists in SnapTrade. Database error occurred while checking existing user.'
            };
          }
        }
        
        // Handle other specific error types
        let errorMessage = error.message;
        
        if (error.message.includes('Request failed with status code')) {
          errorMessage = `SnapTrade API error: ${error.message}`;
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
          errorMessage = 'SnapTrade API connection failed. Check network connectivity and API endpoint.';
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          errorMessage = 'SnapTrade authentication failed. Check your API credentials.';
        } else if (error.message.includes('400') || error.message.includes('Bad Request')) {
          errorMessage = 'SnapTrade API request invalid. Check request parameters and API documentation.';
        }
        
        return { success: false, error: errorMessage };
      }
      
      return { success: false, error: 'Registration failed' };
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

    // Get user accounts
  async getUserAccounts(userId: string, userSecret: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Getting accounts for user:', userId);
      
      // Try to get user holdings first, which should include account information
      const holdings = await snaptrade.accountInformation.getAllUserHoldings({
        userId,
        userSecret,
      });
      
      console.log('🔍 Holdings retrieved successfully');
      
      // Extract unique accounts from holdings
      const accounts = new Map();
      if (holdings.data && Array.isArray(holdings.data)) {
        holdings.data.forEach((accountHolding: any) => {
          console.log('🔍 Processing account holding:', accountHolding);
          
          if (accountHolding.account) {
            const account = accountHolding.account;
            const accountId = account.id;
            
            if (accountId && !accounts.has(accountId)) {
              // Calculate total value from positions and cash
              let totalValue = 0;
              
              // Check total_value from the account holding (root level)
              if (accountHolding.total_value && accountHolding.total_value.value) {
                totalValue = accountHolding.total_value.value;
              }
              
              // Also check balances array for cash
              if (account.balances && Array.isArray(account.balances)) {
                account.balances.forEach((balance: any) => {
                  if (balance.cash) {
                    totalValue += balance.cash;
                  }
                });
              }
              
              // Debug logging
              console.log(`🔍 Account ${account.name} (${accountId}):`, {
                accountHoldingTotalValue: accountHolding.total_value,
                accountTotalValue: account.total_value,
                balances: account.balances,
                calculatedTotal: totalValue
              });
              
              // Determine account type based on account properties
              let accountType = 'investment'; // default
              let accountSubtype = '';
              
              if (account.type) {
                accountType = account.type;
              } else {
                // Determine account type based on account name patterns
                const accountName = (account.name || '').toLowerCase();
                if (accountName.includes('brokerage')) {
                  accountType = 'brokerage';
                } else if (accountName.includes('treasury')) {
                  accountType = 'treasury';
                } else if (accountName.includes('ira') || accountName.includes('roth')) {
                  accountType = 'ira';
                } else if (accountName.includes('401k') || accountName.includes('401(k)')) {
                  accountType = '401k';
                } else if (accountName.includes('hsa')) {
                  accountType = 'hsa';
                } else if (accountName.includes('529')) {
                  accountType = '529';
                } else {
                  // Default to investment for unknown account types
                  accountType = 'investment';
                }
              }
              
              // Add subtype if available
              if (account.subtype) {
                accountSubtype = account.subtype;
              }

              accounts.set(accountId, {
                id: accountId,
                name: account.name || `Account ${account.number}`,
                type: accountType,
                subtype: accountSubtype,
                institution: account.brokerage_authorization?.brokerage?.display_name || account.brokerage_authorization?.brokerage?.name || 'Unknown',
                balance: totalValue,
                accountNumber: account.number,
                syncStatus: account.sync_status
              });
            }
          }
        });
      }
      
      return { 
        success: true, 
        data: {
          accounts: Array.from(accounts.values())
        }
      };
    } catch (error) {
      console.error('SnapTrade get accounts failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Get accounts failed' };
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

  // Get user activities (transactions) for all accounts
  // ✅ Accepts optional pre-fetched accounts to avoid redundant API calls
  async getUserActivities(userId: string, userSecret: string, prefetchedAccounts?: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Getting activities for user:', userId);
      
      // ✅ Use pre-fetched accounts if provided, otherwise fetch them
      let accountsResult = prefetchedAccounts;
      if (!accountsResult) {
        console.log('🔍 No pre-fetched accounts, fetching now...');
        accountsResult = await this.getUserAccounts(userId, userSecret);
      } else {
        console.log('✅ Using pre-fetched accounts, skipping redundant API call');
      }
      
      if (!accountsResult.success || !accountsResult.data?.accounts) {
        return { success: false, error: 'Failed to get accounts for activities' };
      }
      
      // Get activities for each account
      const allActivities = [];
      
      // ✅ Set date range for activities (last 2 years to capture all historical transactions)
      const endDate = new Date().toISOString().split('T')[0]; // Today (YYYY-MM-DD)
      const startDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 2 years ago (730 days)
      
      console.log(`🔍 Fetching activities from ${startDate} to ${endDate}`);
      
      for (const account of accountsResult.data.accounts) {
        try {
          console.log(`🔍 Getting activities for account: ${account.name} (${account.id})`);
          
          const activities = await snaptrade.accountInformation.getAccountActivities({
            accountId: account.id,
            userId,
            userSecret,
            startDate,  // ✅ Required parameter
            endDate,    // ✅ Required parameter
            type: "BUY,SELL,DIVIDEND,CONTRIBUTION,WITHDRAWAL,REI,INTEREST,FEE,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE", // ✅ All transaction types
            limit: 1000 // Get up to 1000 activities per account
          });
          
          if (activities.data && Array.isArray(activities.data)) {
            // ✅ Add account info to each activity (including account_id for transaction mapping)
            const accountActivities = activities.data.map((activity: any) => ({
              ...activity,
              account_id: account.id,  // ✅ Add account ID for linking
              account_name: account.name,
              account_number: account.accountNumber,
              institution: activity.institution || account.institution
            }));
            
            allActivities.push(...accountActivities);
            console.log(`🔍 Found ${accountActivities.length} activities for account ${account.name}`);
          }
        } catch (accountError) {
          console.error(`🔍 Error getting activities for account ${account.name}:`, accountError);
          // Continue with other accounts even if one fails
        }
      }
      
      console.log(`🔍 Total activities found: ${allActivities.length}`);
      
      return {
        success: true,
        data: {
          activities: allActivities,
          total: allActivities.length
        }
      };
    } catch (error) {
      console.error('SnapTrade get activities failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Get activities failed' };
    }
  }

  // Delete user
  async deleteUser(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Deleting SnapTrade user:', userId);
      
      // First, try to delete from SnapTrade
      const deleteResponse = await snaptrade.authentication.deleteSnapTradeUser({ 
        userId 
      });
      
      console.log('🔍 User deleted from SnapTrade successfully');
      
      // Then try to delete from our database (if it exists)
      try {
        const db = getPrismaClient();
        await db.snapTradeUser.delete({
          where: { userId }
        });
        console.log('🔍 User deleted from database successfully');
      } catch (dbError) {
        console.log('🔍 User not found in database (this is okay if it was never stored)');
      }
      
      return { 
        success: true, 
        data: deleteResponse.data
      };
    } catch (error) {
      console.error('SnapTrade delete user failed:', error);
      
      // Handle specific error cases
      if (error instanceof Error) {
        // If user doesn't exist in SnapTrade, just delete from our database
        if (error.message.includes('User not found') || error.message.includes('404')) {
          console.log('🔍 User not found in SnapTrade, deleting from database only');
          
          try {
            const db = getPrismaClient();
            await db.snapTradeUser.delete({
              where: { userId: userId }
            });
            
            return { 
              success: true, 
              data: {
                userId: userId,
                message: 'User deleted from database (user not found in SnapTrade)'
              }
            };
          } catch (dbError) {
            console.error('Database deletion failed:', dbError);
            return { success: false, error: 'Failed to delete user from database' };
          }
        }
        
        return { success: false, error: error.message };
      }
      
      return { success: false, error: 'Delete user failed' };
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
    
    // Create the database record like the real service does
    const db = getPrismaClient();
    await db.snapTradeUser.create({
      data: {
        userId: userId,
        snapTradeUserId: userId,
        userSecret: `mock_secret_${userId}`,
        status: 'registered'
      }
    });
    
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
    
    // Actually delete the user from the database like the real service does
    const db = getPrismaClient();
    await db.snapTradeUser.deleteMany({
      where: { userId }
    });
    
    return {
      success: true,
      data: {
        message: 'User deleted successfully'
      }
    };
  };
}
