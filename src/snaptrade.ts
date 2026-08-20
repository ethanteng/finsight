// SnapTrade integration using official SDK
import { Snaptrade } from 'snaptrade-typescript-sdk';
import { PrismaClient } from '@prisma/client';
import {
  getProviderRequestTimeoutMs,
  type ProviderRetryOptions,
  withTransientProviderRetry,
} from './services/provider-request-policy';

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
  baseOptions: {
    timeout: getProviderRequestTimeoutMs('SNAPTRADE_REQUEST_TIMEOUT_MS'),
  },
});

const SNAPTRADE_ACTIVITY_PAGE_SIZE = 1000;
/** Cap concurrent getUserHoldings calls so a multi-account user does not burst SnapTrade. */
const SNAPTRADE_HOLDINGS_CONCURRENCY = 5;

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function connectionId(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && typeof (value as any).id === 'string') {
    return (value as any).id;
  }
  return undefined;
}

function currencyCode(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && typeof (value as any).code === 'string') {
    return (value as any).code;
  }
  return undefined;
}

// SnapTrade reports the account rollup as balance.total across current SDKs, but
// older payloads and some brokerages only carry total_value. A missing rollup is
// left as null so callers can fall back to holdings instead of inventing a zero.
function accountTotalBalance(account: any): number | null {
  const candidates = [
    account?.balance?.total?.amount,
    account?.balance?.total,
    account?.total_value?.value,
    account?.total_value,
  ];
  for (const candidate of candidates) {
    const value = finiteNumber(candidate);
    if (value !== null) return value;
  }
  return null;
}

function inferSnapTradeAccountType(account: any): { type: string; subtype: string } {
  const rawType = String(account.raw_type || '').trim().toLowerCase();
  const descriptor = `${rawType} ${String(account.name || '').toLowerCase()}`;
  if (descriptor.includes('mortgage')) return { type: 'loan', subtype: 'mortgage' };
  if (descriptor.includes('401k') || descriptor.includes('401(k)')) return { type: 'investment', subtype: '401k' };
  if (descriptor.includes('ira') || descriptor.includes('roth')) return { type: 'investment', subtype: 'ira' };
  if (descriptor.includes('hsa')) return { type: 'investment', subtype: 'hsa' };
  if (descriptor.includes('529')) return { type: 'investment', subtype: '529' };
  return { type: 'investment', subtype: rawType || 'brokerage' };
}

// Enhanced SnapTrade service class using official SDK
export class SnapTradeService {
  private readonly client: Snaptrade;
  private readonly retryOptions: ProviderRetryOptions;

  constructor(client: Snaptrade = snaptrade, retryOptions: ProviderRetryOptions = {}) {
    this.client = client;
    this.retryOptions = retryOptions;
  }

  private read<T>(operation: () => Promise<T>): Promise<T> {
    return withTransientProviderRetry(operation, this.retryOptions);
  }
  
  // Health check using official SDK
  async healthCheck(): Promise<boolean> {
    try {
      const status = await this.read(() => this.client.apiStatus.check());
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
      const registration = await this.client.authentication.registerSnapTradeUser({
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

  /**
   * Get login redirect URI.
   *
   * `reconnectAuthorizationId` repairs an existing brokerage authorization
   * instead of adding another one. Without it the portal opens the ordinary
   * connect flow, so a user sent here to fix a disabled connection ends up with
   * two connections to the same brokerage -- the original still disabled, and a
   * new one whose accounts duplicate its holdings.
   */
  async getLoginRedirect(
    userId: string,
    userSecret: string,
    reconnectAuthorizationId?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Getting login redirect for user:', userId, reconnectAuthorizationId ? '(reconnect)' : '(new connection)');

      const loginData = await this.client.authentication.loginSnapTradeUser({
        userId,
        userSecret,
        ...(reconnectAuthorizationId ? { reconnect: reconnectAuthorizationId } : {}),
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

      const [accountsResponse, connectionsResult] = await Promise.all([
        this.read(() => this.client.accountInformation.listUserAccounts({ userId, userSecret })),
        this.read(() => this.client.connections.listBrokerageAuthorizations({ userId, userSecret }))
          .then((response: any) => ({ ok: true as const, data: response?.data }))
          .catch(error => {
            console.warn('SnapTrade connection status unavailable; continuing with account data:', error);
            return {
              ok: false as const,
              error: error instanceof Error ? error.message : String(error),
            };
          }),
      ]);
      // A failed authorization lookup means connection health is unknown, not
      // healthy. Reporting connectionDisabled: false here would let a disabled
      // connection's cached balances be presented as current.
      const connectionStatusError = connectionsResult.ok ? undefined : connectionsResult.error;
      const connections = new Map<string, any>();
      for (const connection of connectionsResult.ok && Array.isArray(connectionsResult.data)
        ? connectionsResult.data
        : []) {
        if (connection?.id) connections.set(connection.id, connection);
      }
      const rawAccounts = Array.isArray(accountsResponse.data) ? accountsResponse.data : [];
      const accounts = rawAccounts.flatMap((account: any) => {
        if (!account?.id) return [];
        const authorizationId = connectionId(account.brokerage_authorization);
        const authorization = connections.get(authorizationId || '');
        // Unknown when the lookup failed outright, and also when it succeeded but
        // did not return the authorization this account points at.
        const connectionStatusUnavailable = Boolean(connectionStatusError)
          || Boolean(authorizationId && !authorization);
        const accountType = inferSnapTradeAccountType(account);
        const holdingsSync = account.sync_status?.holdings;
        const transactionsSync = account.sync_status?.transactions;
        return [{
          id: account.id,
          name: account.name || `Account ${account.number || account.id}`,
          type: accountType.type,
          subtype: accountType.subtype,
          institution: account.institution_name
            || authorization?.brokerage?.display_name
            || authorization?.brokerage?.name
            || authorization?.name
            || 'Unknown',
          balance: accountTotalBalance(account),
          balanceCurrency: currencyCode(account.balance?.total?.currency)
            || currencyCode(account.total_value?.currency)
            || 'USD',
          accountNumber: account.number,
          brokerageAuthorizationId: authorizationId,
          syncStatus: account.sync_status,
          holdingsInitialSyncCompleted: holdingsSync?.initial_sync_completed,
          transactionsInitialSyncCompleted: transactionsSync?.initial_sync_completed,
          lastSuccessfulHoldingsSync: holdingsSync?.last_successful_sync || null,
          lastSuccessfulTransactionsSync: transactionsSync?.last_successful_sync || null,
          connectionDisabled: connectionStatusUnavailable ? undefined : Boolean(authorization?.disabled),
          connectionStatusUnavailable,
          connectionDisabledAt: authorization?.disabled_date || null,
          dataFreshnessMode: authorization?.data_freshness_mode,
          status: account.status,
        }];
      });
      
      return { 
        success: true, 
        data: {
          accounts,
          connectionStatusError,
        }
      };
    } catch (error: any) {
      // Check if it's a 401 Unauthorized error (invalid credentials)
      const is401 = error?.status === 401 || error?.code === 'ERR_BAD_REQUEST' && error?.status === 401;
      if (is401) {
        console.warn(`⚠️ SnapTrade accounts: 401 Unauthorized for user ${userId} - credentials may be expired or invalid. Continuing without SnapTrade accounts.`);
        return { 
          success: false, 
          error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.'
        };
      }
      console.error('SnapTrade get accounts failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Get accounts failed' };
    }
  }

  // Get user holdings
  async getUserHoldings(
    userId: string,
    userSecret: string,
    prefetchedAccounts?: any,
  ): Promise<{ success: boolean; data?: any; error?: string; errors?: Array<{ accountId: string; error: string }> }> {
    try {
      console.log('🔍 Getting holdings for user:', userId);
      const accountsResult = prefetchedAccounts || await this.getUserAccounts(userId, userSecret);
      if (!accountsResult.success || !Array.isArray(accountsResult.data?.accounts)) {
        return { success: false, error: accountsResult.error || 'Failed to get SnapTrade accounts' };
      }

      const settled = await mapWithConcurrency(
        accountsResult.data.accounts,
        SNAPTRADE_HOLDINGS_CONCURRENCY,
        async (account: any) => {
          const response = await this.read(() => this.client.accountInformation.getUserHoldings({
            accountId: account.id,
            userId,
            userSecret,
          }));
          return {
            ...response.data,
            account: {
              ...account,
              id: account.id,
              name: account.name,
              number: account.accountNumber,
              institution_name: account.institution,
              sync_status: account.syncStatus,
            },
          };
        },
      );

      const data: any[] = [];
      const errors: Array<{ accountId: string; error: string }> = [];
      settled.forEach((result, index) => {
        const account = accountsResult.data.accounts[index];
        if (result.status === 'fulfilled') data.push(result.value);
        else errors.push({
          accountId: account.id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      });

      if (data.length === 0 && errors.length > 0) {
        // Prefer the first underlying provider message so credential sniffing
        // (credentials|invalid|expired) still triggers the reconnect prompt.
        return {
          success: false,
          error: errors[0]?.error || 'Failed to fetch holdings for every SnapTrade account',
          errors,
        };
      }
      console.log(`🔍 Holdings retrieved for ${data.length} SnapTrade account(s)`);
      return { success: true, data, errors };
    } catch (error: any) {
      // Check if it's a 401 Unauthorized error (invalid credentials)
      const is401 = error?.status === 401 || error?.code === 'ERR_BAD_REQUEST' && error?.status === 401;
      if (is401) {
        console.warn(`⚠️ SnapTrade holdings: 401 Unauthorized for user ${userId} - credentials may be expired or invalid. Continuing without SnapTrade holdings.`);
        return { 
          success: false, 
          error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.'
        };
      }
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
      const allActivities: any[] = [];
      const errors: Array<{ accountId: string; error: string }> = [];
      const seenActivities = new Set<string>();
      
      // ✅ Set date range for activities (configurable via INVESTMENT_HISTORY_YEARS env var)
      const endDate = new Date().toISOString().split('T')[0]; // Today (YYYY-MM-DD)
      const investmentHistoryYears = parseInt(process.env.INVESTMENT_HISTORY_YEARS || '2', 10);
      const investmentHistoryDays = investmentHistoryYears * 365;
      const startDate = new Date(Date.now() - investmentHistoryDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      console.log(`🔍 Fetching SnapTrade activities from ${startDate} to ${endDate} (${investmentHistoryYears} years)`);
      
      for (const account of accountsResult.data.accounts) {
        try {
          console.log(`🔍 Getting activities for account: ${account.name} (${account.id})`);
          
          let offset = 0;
          let total = Number.POSITIVE_INFINITY;
          let accountActivityCount = 0;

          while (offset < total) {
            const response = await this.read(() => this.client.accountInformation.getAccountActivities({
              accountId: account.id,
              userId,
              userSecret,
              startDate,
              endDate,
              // Do not send a type filter. That preserves transfers, splits,
              // taxes, stock dividends, and future provider activity types.
              limit: SNAPTRADE_ACTIVITY_PAGE_SIZE,
              offset,
            }));
            const page = Array.isArray(response.data?.data)
              ? response.data.data
              : Array.isArray(response.data) ? response.data : [];
            const reportedTotal = response.data?.pagination?.total;
            total = typeof reportedTotal === 'number' && Number.isFinite(reportedTotal)
              ? Math.max(0, reportedTotal)
              : offset + page.length;

            if (page.length === 0) {
              if (offset < total) {
                throw new Error(`SnapTrade activity pagination stalled at ${offset} of ${total}`);
              }
              break;
            }

            for (const activity of page) {
              const activityKey = `${account.id}:${activity.id || `${activity.trade_date}:${activity.type}:${activity.amount}`}`;
              if (seenActivities.has(activityKey)) continue;
              seenActivities.add(activityKey);
              allActivities.push({
                ...activity,
                account_id: account.id,
                account_name: account.name,
                account_number: account.accountNumber,
                institution: activity.institution || account.institution,
                transactions_last_successful_sync: account.lastSuccessfulTransactionsSync,
                connection_disabled: account.connectionDisabled,
              });
              accountActivityCount++;
            }
            offset += page.length;
          }
          console.log(`🔍 Found ${accountActivityCount} activities for account ${account.name}`);
        } catch (accountError: any) {
          // Check if it's a 401 Unauthorized error (invalid credentials)
          const is401 = accountError?.status === 401 || accountError?.code === 'ERR_BAD_REQUEST' && accountError?.status === 401;
          if (is401) {
            console.warn(`⚠️ SnapTrade activities: 401 Unauthorized for account ${account.name} (user ${userId}) - credentials may be expired or invalid. Continuing without SnapTrade activities for this account.`);
          } else {
            console.error(`🔍 Error getting activities for account ${account.name}:`, accountError);
          }
          errors.push({
            accountId: account.id,
            error: accountError instanceof Error ? accountError.message : String(accountError),
          });
          // Continue with other accounts even if one fails
        }
      }
      
      console.log(`🔍 Total activities found: ${allActivities.length}`);
      
      return {
        success: true,
        data: {
          activities: allActivities,
          total: allActivities.length,
          errors,
        },
      };
    } catch (error: any) {
      // Check if it's a 401 Unauthorized error (invalid credentials)
      const is401 = error?.status === 401 || error?.code === 'ERR_BAD_REQUEST' && error?.status === 401;
      if (is401) {
        console.warn(`⚠️ SnapTrade activities: 401 Unauthorized for user ${userId} - credentials may be expired or invalid. Continuing without SnapTrade activities.`);
        return { 
          success: false, 
          error: 'SnapTrade credentials invalid or expired. Please reconnect your SnapTrade account.'
        };
      }
      console.error('SnapTrade get activities failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Get activities failed' };
    }
  }

  // Delete user
  async deleteUser(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🔍 Deleting SnapTrade user:', userId);
      
      // First, try to delete from SnapTrade
      const deleteResponse = await this.client.authentication.deleteSnapTradeUser({
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
      data: [{
        account: {
          id: 'mock-account-1',
          name: 'Mock Investment Account',
          number: '0001',
          sync_status: {
            holdings: { initial_sync_completed: true, last_successful_sync: '2026-08-18T00:00:00Z' },
          },
        },
        balances: [{ currency: { code: 'USD' }, cash: 0 }],
        positions: [{
          symbol: { id: 'mock-security-1', symbol: { symbol: 'AAPL', description: 'Apple Inc.' } },
          units: 10,
          price: 150,
          average_purchase_price: 100,
          currency: { code: 'USD' },
        }],
      }],
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
