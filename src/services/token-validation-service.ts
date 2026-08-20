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
  /**
   * Brokerage authorizations to repair when status is LOGIN_REQUIRED. Passing
   * one to the SnapTrade portal fixes that existing connection; without it the
   * portal adds a second connection to the same brokerage and leaves the broken
   * one in place.
   *
   * A list because a user can have several brokerages disabled at once, and one
   * trip through the portal repairs exactly one authorization. The caller
   * repairs the first; the next status read returns a shorter list, so
   * repeating the action walks through them without needing its own UI.
   */
  reconnectAuthorizationIds?: string[];
  /**
   * The disabled connections themselves, so a caller can attribute a failure to
   * the brokerage it belongs to instead of applying one status to every account.
   * SnapTrade health is per brokerage authorization; this type describes a
   * SnapTrade *user*, and collapsing the two is what let one disabled brokerage
   * mark every other account broken.
   */
  disabledConnections?: Array<{ authorizationId: string; institutionName: string | null }>;
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
        // getUserAccounts succeeding only means SnapTrade answered for this
        // user. It computes per-connection health on the way through, and
        // reading only `success` threw that away -- a brokerage authorization
        // marked disabled still lists its accounts and their last cached
        // balances, so the connection reported healthy while its figures
        // quietly aged.
        //
        // Only `disabled` is surfaced. It is the one state with a repair path
        // the product can offer (reconnect through the SnapTrade portal), and
        // this codebase's rule is that a connection is only flagged once a user
        // can act on it. `connectionStatusUnavailable` means health is unknown,
        // often a transient lookup failure, with nothing for the user to do.
        const accounts: any[] = Array.isArray(result.data?.accounts) ? result.data.accounts : [];
        const disabled = accounts.filter(account => account?.connectionDisabled === true);
        if (disabled.length > 0) {
          // Per connection, keyed by the brokerage it belongs to. A caller that
          // renders health against an account can then say something true about
          // *that* account. The summary `error` below deliberately names no
          // institution: it is a single string describing the whole SnapTrade
          // user, and any UI that shows it beside an account would otherwise
          // report a healthy Fidelity 401k as "disabled for Public".
          const disabledConnections = Array.from(
            new Map(
              disabled
                .filter(account => typeof account.brokerageAuthorizationId === 'string'
                  && account.brokerageAuthorizationId.length > 0)
                .map(account => [
                  account.brokerageAuthorizationId as string,
                  {
                    authorizationId: account.brokerageAuthorizationId as string,
                    institutionName: typeof account.institution === 'string' && account.institution
                      ? account.institution
                      : null,
                  },
                ])
            ).values()
          );
          const reconnectAuthorizationIds = disabledConnections.map(connection => connection.authorizationId);
          const count = disabledConnections.length || disabled.length;
          return {
            userId,
            status: TokenStatus.LOGIN_REQUIRED,
            error: count === 1
              ? 'A SnapTrade brokerage connection is disabled. Reconnect to resume updates.'
              : `${count} SnapTrade brokerage connections are disabled. Reconnect to resume updates.`,
            lastChecked: new Date(),
            ...(disabledConnections.length > 0 ? { disabledConnections } : {}),
            ...(reconnectAuthorizationIds.length > 0 ? { reconnectAuthorizationIds } : {}),
          };
        }

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
