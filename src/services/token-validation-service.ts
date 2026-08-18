import { PrismaClient } from '@prisma/client';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { SnapTradeService } from '../snaptrade';
import { getProviderRequestTimeoutMs, withTransientProviderRetry } from './provider-request-policy';

const prisma = new PrismaClient();

// Plaid configuration
const plaidMode = process.env.PLAID_MODE || 'sandbox';
const useSandbox = plaidMode === 'sandbox';

const getPlaidCredentials = () => {
  if (plaidMode === 'production') {
    return {
      clientId: process.env.PLAID_CLIENT_ID_PROD || process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET_PROD || process.env.PLAID_SECRET,
      env: process.env.PLAID_ENV_PROD || 'production'
    };
  } else {
    return {
      clientId: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      env: 'sandbox'
    };
  }
};

const credentials = getPlaidCredentials();
const configuration = new Configuration({
  basePath: useSandbox ? PlaidEnvironments.sandbox : PlaidEnvironments[credentials.env as keyof typeof PlaidEnvironments],
  baseOptions: {
    timeout: getProviderRequestTimeoutMs('PLAID_REQUEST_TIMEOUT_MS'),
    headers: {
      'PLAID-CLIENT-ID': credentials.clientId,
      'PLAID-SECRET': credentials.secret,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

export enum TokenStatus {
  VALID = 'valid',
  EXPIRED = 'expired',
  LOGIN_REQUIRED = 'login_required',
  PRODUCTS_NOT_SUPPORTED = 'products_not_supported',
  ERROR = 'error'
}

export interface PlaidTokenHealth {
  tokenId: string;
  status: TokenStatus;
  error?: string;
  lastChecked: Date;
}

export interface SnapTradeTokenHealth {
  userId: string;
  status: TokenStatus;
  error?: string;
  lastChecked: Date;
}

export function plaidTokenHealthFromError(
  tokenId: string,
  error: any,
  lastChecked = new Date(),
): PlaidTokenHealth {
  const errorCode = error?.response?.data?.error_code;
  if (errorCode === 'ITEM_LOGIN_REQUIRED') {
    return { tokenId, status: TokenStatus.LOGIN_REQUIRED, error: 'Account requires re-authentication', lastChecked };
  }
  if (errorCode === 'PRODUCTS_NOT_SUPPORTED') {
    return { tokenId, status: TokenStatus.PRODUCTS_NOT_SUPPORTED, error: 'Products not supported for this institution', lastChecked };
  }
  return {
    tokenId,
    status: TokenStatus.ERROR,
    error: error?.response?.data?.error_message || error?.message || 'Unknown error',
    lastChecked,
  };
}

export class TokenValidationService {
  /**
   * Validate all Plaid tokens for a user
   */
  async validatePlaidTokens(userId: string): Promise<PlaidTokenHealth[]> {
    console.log('TokenValidationService: Validating Plaid tokens for user:', userId);
    
    const accessTokens = await prisma.accessToken.findMany({
      where: { userId }
    });

    const results: PlaidTokenHealth[] = [];

    for (const tokenRecord of accessTokens) {
      const health = await this.validatePlaidToken(tokenRecord.token, tokenRecord.id);
      results.push(health);
    }

    return results;
  }

  /**
   * Validate a single Plaid token
   */
  private async validatePlaidToken(token: string, tokenId: string): Promise<PlaidTokenHealth> {
    try {
      // Try to get accounts as a lightweight check
      await withTransientProviderRetry(() => plaidClient.accountsGet({
        access_token: token
      }));

      return {
        tokenId,
        status: TokenStatus.VALID,
        lastChecked: new Date()
      };
    } catch (error: any) {
      return plaidTokenHealthFromError(tokenId, error);
    }
  }

  /**
   * Validate SnapTrade token for a user
   */
  async validateSnapTradeToken(userId: string): Promise<SnapTradeTokenHealth> {
    console.log('TokenValidationService: Validating SnapTrade token for user:', userId);

    try {
      const snapTradeUser = await prisma.snapTradeUser.findUnique({
        where: { userId }
      });

      if (!snapTradeUser || !snapTradeUser.userSecret) {
        return {
          userId,
          status: TokenStatus.ERROR,
          error: 'SnapTrade user not found',
          lastChecked: new Date()
        };
      }

      const snapTradeService = new SnapTradeService();
      // NOTE: This makes an API call to validate the token. If this is called in parallel
      // with FinancialDataService.fetchSnapTradeData, there will be redundant API calls.
      // Future optimization: Cache account validation results for a short time (e.g., 5 minutes)
      const result = await snapTradeService.getUserAccounts(userId, snapTradeUser.userSecret);

      if (result.success) {
        return {
          userId,
          status: TokenStatus.VALID,
          lastChecked: new Date()
        };
      } else {
        // Check if it's an auth error
        const isAuthError = result.error?.toLowerCase().includes('auth') || 
                           result.error?.toLowerCase().includes('unauthorized');
        
        return {
          userId,
          status: isAuthError ? TokenStatus.LOGIN_REQUIRED : TokenStatus.ERROR,
          error: result.error || 'Unknown error',
          lastChecked: new Date()
        };
      }
    } catch (error: any) {
      return {
        userId,
        status: TokenStatus.ERROR,
        error: error.message || 'Unknown error',
        lastChecked: new Date()
      };
    }
  }

  /**
   * Get comprehensive token health for a user
   */
  async getTokenHealth(userId: string): Promise<{
    plaid: PlaidTokenHealth[];
    snaptrade: SnapTradeTokenHealth;
  }> {
    const [plaidHealth, snapTradeHealth] = await Promise.all([
      this.validatePlaidTokens(userId),
      this.validateSnapTradeToken(userId)
    ]);

    return {
      plaid: plaidHealth,
      snaptrade: snapTradeHealth
    };
  }

  /**
   * Build health from the exact provider observations used for this snapshot.
   * This avoids validating each credential with another accounts/holdings call
   * and keeps health, balances, and holdings on one revision.
   */
  getTokenHealthFromObservations(
    userId: string,
    plaidObservation: { tokenHealth?: PlaidTokenHealth[] } | null | undefined,
    snapTradeObservation: { tokenHealth?: SnapTradeTokenHealth } | null | undefined,
  ): { plaid: PlaidTokenHealth[]; snaptrade: SnapTradeTokenHealth } {
    return {
      plaid: plaidObservation?.tokenHealth ?? [],
      snaptrade: snapTradeObservation?.tokenHealth ?? {
        userId,
        status: TokenStatus.ERROR,
        error: 'SnapTrade observation unavailable',
        lastChecked: new Date(),
      },
    };
  }
}
