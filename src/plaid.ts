import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { PrismaClient } from '@prisma/client';
import { enhanceProfileWithInvestmentData, enhanceProfileWithLiabilityData, enhanceProfileWithEnrichmentData } from './profile/enhancer';
import { BalanceService } from './services/balance-service';
import { FinancialDataService } from './services/financial-data-service';
import { SnapTradeService } from './snaptrade';
import { TransactionSyncService } from './services/transaction-sync-service';
import { matchAccountsAcrossConnections, toConnectionAccount } from './services/plaid-connection-supersede';
import { normalizeAssetType } from './services/asset-class';
import { normalizeLabel } from './services/label-normalization';

// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma: PrismaClient | null = null;

const getPrismaClient = () => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

// Determine Plaid mode from environment variable
const plaidMode = process.env.PLAID_MODE || 'sandbox';
const useSandbox = plaidMode === 'sandbox';

// Select appropriate environment variables based on mode
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
  basePath: useSandbox ? PlaidEnvironments.sandbox : PlaidEnvironments[credentials.env],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': credentials.clientId,
      'PLAID-SECRET': credentials.secret,
    },
  },
});

// Log Plaid environment configuration
console.log('Plaid Configuration:', {
  mode: plaidMode,
  environment: useSandbox ? 'sandbox' : credentials.env,
  accessLevel: useSandbox ? 'sandbox' : (process.env.PLAID_ACCESS_LEVEL || 'sandbox'),
  hasClientId: !!credentials.clientId,
  hasSecret: !!credentials.secret,
  useSandbox: useSandbox,
  isProduction: plaidMode === 'production',
  credentialsSource: plaidMode === 'production' ? 'production variables' : 'sandbox variables'
});

const plaidClient = new PlaidApi(configuration);

// Export the plaidClient for use in other modules
export { plaidClient };

// Safety check: Prevent real Plaid API calls in test/CI environments
if (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) {
  console.log('Plaid: Test/CI environment detected - using mock responses');

  // Override the plaidClient methods to return mock data in test environment
  const originalAccountsGet = plaidClient.accountsGet;
  const originalAccountsBalanceGet = plaidClient.accountsBalanceGet;

  plaidClient.accountsGet = async (request: any) => {
    console.log('Plaid: Mock accountsGet called with:', request);
    // In test environment, return empty accounts to test user isolation
    return {
      data: {
        accounts: []
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {}
    } as any;
  };

  plaidClient.accountsBalanceGet = async (request: any) => {
    console.log('Plaid: Mock accountsBalanceGet called with:', request);
    // In test environment, return empty accounts to test user isolation
    return {
      data: {
        accounts: []
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {}
    } as any;
  };
}

export const processTransactionData = (transaction: any) => {
  // ✅ Extract basic categories from personal_finance_category if legacy category is empty
  let basicCategory = transaction.category || [];
  let basicCategoryId = transaction.category_id;

  // If legacy category is empty but personal_finance_category exists, use that for basic categorization
  if ((!basicCategory || basicCategory.length === 0 || basicCategory[0] === null) &&
      transaction.personal_finance_category) {
    basicCategory = [
      transaction.personal_finance_category.primary,
      transaction.personal_finance_category.detailed
    ].filter(Boolean);
    basicCategoryId = transaction.personal_finance_category.primary;
  }

  // ✅ FIX: Interpret transaction amounts correctly
  // Most transactions from Plaid are purchases/charges (money going out)
  // We need to make them negative for intuitive display
  let correctedAmount = transaction.amount;

  // Check if this is likely a credit/refund (should remain positive)
  const isCredit = transaction.name?.toLowerCase().includes('credit') ||
                   transaction.name?.toLowerCase().includes('refund') ||
                   transaction.name?.toLowerCase().includes('return') ||
                   transaction.name?.toLowerCase().includes('deposit') ||
                   transaction.name?.toLowerCase().includes('payment') ||
                   transaction.name?.toLowerCase().includes('reimbursement') ||
                   transaction.name?.toLowerCase().includes('claim') ||
                   transaction.name?.toLowerCase().includes('insurance') ||
                   transaction.name?.toLowerCase().includes('zelle') ||
                   transaction.merchant_name?.toLowerCase().includes('credit') ||
                   transaction.merchant_name?.toLowerCase().includes('refund') ||
                   transaction.merchant_name?.toLowerCase().includes('return') ||
                   transaction.merchant_name?.toLowerCase().includes('deposit') ||
                   transaction.merchant_name?.toLowerCase().includes('payment') ||
                   transaction.merchant_name?.toLowerCase().includes('reimbursement') ||
                   transaction.merchant_name?.toLowerCase().includes('claim') ||
                   transaction.merchant_name?.toLowerCase().includes('insurance') ||
                   // Check if categories suggest this is income/credit
                   (basicCategory && basicCategory.some((cat: string) =>
                     cat?.toLowerCase().includes('income') ||
                     cat?.toLowerCase().includes('transfer') ||
                     cat?.toLowerCase().includes('insurance')
                   ));

  // If this is a credit/refund, ensure it's positive
  if (isCredit) {
    if (correctedAmount < 0) {
      correctedAmount = Math.abs(correctedAmount);
      console.log(`✅ Credit correction: "${transaction.name}" ${transaction.amount} → ${correctedAmount} (negative credit converted to positive)`);
    } else {
      console.log(`✅ Credit detected: "${transaction.name}" ${transaction.amount} (already positive)`);
    }
  }
  // If this looks like a purchase (has merchant info, categories, etc.), make it negative
  // BUT only if it's not a credit/refund
  else if (!isCredit && (
      transaction.merchant_name ||
      transaction.merchant_entity_id ||
      (basicCategory && basicCategory.length > 0) ||
      transaction.payment_channel === 'in store' ||
      transaction.payment_channel === 'online')) {

    // If amount is positive, it's likely a purchase that should be negative
    if (correctedAmount > 0) {
      correctedAmount = -correctedAmount;
      console.log(`🔄 Amount correction: "${transaction.name}" ${transaction.amount} → ${correctedAmount} (purchase detected)`);
    }
  }

  // ✅ IMPORTANT: Don't include Plaid's transaction_type field here!
  // Plaid's transaction_type refers to payment method (place, digital, atm, special, etc.)
  // Our transaction_type (from categorization service) refers to transaction category (income, expense, etc.)
  // Including Plaid's transaction_type causes confusion in the UI
  return {
    id: transaction.transaction_id,
    account_id: transaction.account_id,
    amount: correctedAmount, // Use corrected amount
    source_amount: transaction.source_amount ?? transaction.amount,
    date: transaction.date,
    name: transaction.name,
    category: basicCategory,
    category_id: basicCategoryId,
    personal_finance_category: transaction.personal_finance_category,
    pending: transaction.pending,
    iso_currency_code: transaction.iso_currency_code || 'USD',
    merchant_name: transaction.merchant_name,
    payment_channel: transaction.payment_channel, // This is Plaid's payment method indicator
    // ❌ REMOVED: transaction_type: transaction.transaction_type, // This is Plaid's payment method, not our categorization!
    // Don't pre-populate enriched_data here - let the enrichment process handle it
    enriched_data: null
  };
};

// Enhanced investment data processing functions
const processInvestmentHolding = (holding: any) => {
  return {
    id: `${holding.account_id}_${holding.security_id}_${holding.quantity}_${holding.institution_value}`,
    account_id: holding.account_id,
    security_id: holding.security_id,
    institution_value: holding.institution_value,
    institution_price: holding.institution_price,
    institution_price_as_of: holding.institution_price_as_of,
    cost_basis: holding.cost_basis,
    quantity: holding.quantity,
    iso_currency_code: holding.iso_currency_code,
    unofficial_currency_code: holding.unofficial_currency_code
  };
};

const processInvestmentTransaction = (transaction: any) => {
  return {
    id: `${transaction.investment_transaction_id}_${transaction.account_id}_${transaction.security_id}_${transaction.date}`,
    account_id: transaction.account_id,
    security_id: transaction.security_id,
    amount: transaction.amount,
    date: transaction.date,
    name: transaction.name,
    quantity: transaction.quantity,
    fees: transaction.fees,
    price: transaction.price,
    type: transaction.type,
    subtype: transaction.subtype,
    iso_currency_code: transaction.iso_currency_code,
    unofficial_currency_code: transaction.unofficial_currency_code
  };
};

const processSecurity = (security: any) => {
  return {
    id: security.security_id,
    security_id: security.security_id,
    name: security.name,
    ticker_symbol: security.ticker_symbol,
    type: security.type,
    close_price: security.close_price,
    close_price_as_of: security.close_price_as_of,
    iso_currency_code: security.iso_currency_code,
    unofficial_currency_code: security.unofficial_currency_code
  };
};

// Portfolio analysis functions
const analyzePortfolio = (holdings: any[], securities: any[]) => {
  const portfolioValue = holdings.reduce((total, holding) => {
    return total + (holding.institution_value || 0);
  }, 0);

  const securityMap = new Map(securities.map(sec => [sec.security_id, sec]));

  const assetAllocation = holdings.reduce((allocation, holding) => {
    const security = securityMap.get(holding.security_id);
    const assetType = normalizeAssetType(security?.type || holding.security_type);

    if (!allocation[assetType]) {
      allocation[assetType] = 0;
    }
    allocation[assetType] += (holding.institution_value as number) || 0;

    return allocation;
  }, {} as Record<string, number>);

  // Calculate percentages
  const allocationPercentages = Object.entries(assetAllocation).map(([type, value]) => ({
    type,
    value: value as number,
    percentage: portfolioValue > 0 ? ((value as number) / portfolioValue) * 100 : 0
  }));

  // ✅ FIX: Calculate securityCount from unique security_ids in holdings, not from securities array length
  // This ensures accurate counting even when securities array has duplicates or mismatches
  const uniqueSecurityIds = new Set(holdings.map(h => h.security_id));

  return {
    totalValue: portfolioValue,
    assetAllocation: allocationPercentages,
    holdingCount: holdings.length,
    securityCount: uniqueSecurityIds.size
  };
};

const analyzeInvestmentActivity = (transactions: any[]) => {
  const activityByType = transactions.reduce((activity, transaction) => {
    // Plaid types are lowercase ("buy"), SnapTrade activity types uppercase
    // ("BUY") — group on one label so a merged feed reports one bucket per type.
    const type = normalizeLabel(transaction.type);
    if (!activity[type]) {
      activity[type] = { count: 0, totalAmount: 0 };
    }
    activity[type].count++;
    activity[type].totalAmount += Math.abs(transaction.amount || 0);
    return activity;
  }, {} as Record<string, { count: number; totalAmount: number }>);

  const totalTransactions = transactions.length;
  const totalVolume = transactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

  return {
    totalTransactions,
    totalVolume,
    activityByType,
    averageTransactionSize: totalTransactions > 0 ? totalVolume / totalTransactions : 0
  };
};

// Helper function to handle Plaid errors
const handlePlaidError = (error: any, operation: string) => {
  console.error(`Error in ${operation}:`, error);

  // Check for specific Plaid error codes
  if (error.response?.data?.error_code) {
    const errorCode = error.response.data.error_code;
    const errorMessage = error.response.data.error_message;

    switch (errorCode) {
      case 'ADDITIONAL_CONSENT_REQUIRED':
        return {
          error: 'Additional consent required',
          details: 'This is a sandbox limitation. In production, users would need to provide additional consent.',
          code: errorCode
        };
      case 'INVALID_ACCESS_TOKEN':
        return {
          error: 'Invalid access token',
          details: 'Please reconnect your account.',
          code: errorCode
        };
      case 'ITEM_LOGIN_REQUIRED':
        return {
          error: 'Re-authentication required',
          details: 'Please reconnect your account to refresh access.',
          code: errorCode
        };
      default:
        return {
          error: `Plaid error: ${errorCode}`,
          details: errorMessage || 'An error occurred with Plaid',
          code: errorCode
        };
    }
  }

  return {
    error: 'Failed to complete operation',
    details: error.message || 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR'
  };
};

// Export helper functions for testing and external use
export {
  processInvestmentHolding,
  processInvestmentTransaction,
  processSecurity,
  analyzePortfolio,
  analyzeInvestmentActivity,
  handlePlaidError
};

export const setupPlaidRoutes = (app: any) => {
  console.log('🔧 Setting up Plaid routes...');
  console.log('🔧 App object:', typeof app);
  console.log('🔧 App methods:', Object.keys(app));
  // Create link token with SEAMLESS approach - minimal products + additional consent
  // Supports update mode when accessTokenId provided (for ITEM_LOGIN_REQUIRED reconnect)
  app.post('/plaid/create_link_token', async (req: any, res: any) => {
    try {
      const { accessTokenId } = req.body || {};

      // UPDATE MODE: Reconnect existing Item (e.g. ITEM_LOGIN_REQUIRED) - preserves account_ids
      // If the token is invalid (revoked, expired), Plaid will reject it - fall back to standard flow
      if (accessTokenId && req.user?.id) {
        const tokenRecord = await getPrismaClient().accessToken.findFirst({
          where: { id: accessTokenId, userId: req.user.id }
        });
        if (tokenRecord?.token) {
          try {
            console.log('Creating link token for update mode (reconnect existing Item)');
            const updateRequest = {
              user: { client_user_id: req.user.id },
              client_name: 'Ask Linc',
              language: 'en',
              country_codes: [CountryCode.Us],
              webhook: process.env.PLAID_WEBHOOK_URL || undefined,
              access_token: tokenRecord.token
            };
            const createTokenResponse = await plaidClient.linkTokenCreate(updateRequest);
            res.json({ link_token: createTokenResponse.data.link_token });
            return;
          } catch (updateModeError: any) {
            const errorCode = updateModeError?.response?.data?.error_code;
            console.warn(
              `Update mode link token failed (${errorCode || 'unknown'}): ${updateModeError?.message || updateModeError} - falling back to standard link flow`
            );
            // Fall through to standard create flow - user will re-link, orphan cleanup will migrate data
          }
        }
      }

      // SEAMLESS APPROACH: Start with minimal products to maximize institution coverage
      // Use additional_consented_products to collect consent for everything we might need later
      const request = {
        user: { client_user_id: req.user?.id || 'user-id' },
        client_name: 'Ask Linc',
        language: 'en',
        country_codes: [CountryCode.Us],
        // Start with only Transactions to maximize FI coverage
        products: [Products.Transactions],
        // Ask consent up-front so you can add these later without relinking
        additional_consented_products: [
          Products.Investments,  // For investment accounts
          Products.Liabilities,  // For credit/loan accounts
          Products.Auth,         // For real-time balance (when needed)
        ],
        // Optional: If you want certain scopes *when supported* (but not block Link), list them here:
        // required_if_supported_products: [Products.Investments],
        webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      };

      console.log('Creating seamless link token:');
      console.log(`- Products: ${request.products.join(', ')} (minimal to maximize institution coverage)`);
      console.log(`- Additional consent: ${request.additional_consented_products.join(', ')} (for future access)`);

      const createTokenResponse = await plaidClient.linkTokenCreate(request);
      res.json({ link_token: createTokenResponse.data.link_token });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'creating link token');
      res.status(500).json(errorInfo);
    }
  });

  // Get all accounts with enhanced data
  app.get('/plaid/all-accounts', async (req: any, res: any) => {
    try {


      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing account data' });
      }

      // In test environment, return empty accounts to test user isolation
      if (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) {
        console.log('Plaid: Test environment detected - returning empty accounts for user isolation testing');
        return res.json({ accounts: [] });
      }

      // ✅ Use unified FinancialDataService for consistent data
      const { FinancialDataService } = await import('./services/financial-data-service');
      const financialDataService = new FinancialDataService();

      console.log(`🔍 Fetching accounts for user ${req.user.id} using FinancialDataService`);

      const financialData = await financialDataService.getUserFinancialData(req.user.id, {
        includeTransactions: false,
        includeInvestments: false,
        includeHomeValue: false,
        shouldPersistTransactions: false // ✅ Display-only: don't persist transactions
      });

      // ✅ Filter to ONLY Plaid accounts (exclude SnapTrade accounts)
      // SnapTrade accounts have account_id starting with "snaptrade-"
      const plaidOnlyAccounts = financialData.accounts.filter(account =>
        account.source === 'plaid' || !account.account_id.toString().startsWith('snaptrade-')
      );

      console.log(`🔍 Found ${plaidOnlyAccounts.length} Plaid accounts from FinancialDataService (out of ${financialData.accounts.length} total accounts)`);

      // ✅ Verify no duplicates (FinancialDataService should have already deduplicated)
      const accountIdSet = new Set<string>();
      const duplicateIds: string[] = [];
      plaidOnlyAccounts.forEach(account => {
        const accountId = account.account_id || (account as any).plaidAccountId;
        if (accountId) {
          if (accountIdSet.has(accountId)) {
            duplicateIds.push(accountId);
            console.error(`❌ /plaid/all-accounts: FinancialDataService returned duplicate account_id: ${accountId} (${account.name})`);
          } else {
            accountIdSet.add(accountId);
          }
        }
      });

      if (duplicateIds.length > 0) {
        console.error(`❌ /plaid/all-accounts: FinancialDataService returned ${duplicateIds.length} duplicate accounts! This should not happen.`);
        // This is a critical error - FinancialDataService should be the single source of truth
        // Log it but still return the accounts (deduplication will happen in frontend as safety net)
      }

      // ✅ Flag accounts the provider no longer reports (closed at the institution).
      // Only when this response is built from persisted rows — if Plaid just returned
      // an account in a live fetch, it is open by definition. Comparing a live list
      // against a stale snapshot would mislabel re-authenticated accounts as closed
      // (and hide the token re-auth prompt).
      const { getAccountClosures, closureFor } = await import('./services/account-closure-service');
      const usingPersistedPlaid = financialData.metadata?.dataSources?.plaid === 'persisted';
      const closures = usingPersistedPlaid
        ? await getAccountClosures(req.user.id, plaidOnlyAccounts as any[]).catch(error => {
            // Never fail the accounts list over the closed-account annotation.
            console.warn('/plaid/all-accounts: closed-account detection failed:', error);
            return new Map();
          })
        : new Map();

      // ✅ Format accounts for frontend (matching expected format)
      // Trust FinancialDataService - it should have already deduplicated
      const formattedAccounts = plaidOnlyAccounts.map(account => {
        const accountAny = account as any;
        // Use account_id or plaidAccountId as the primary ID for frontend
        const accountId = account.account_id || accountAny.plaidAccountId || accountAny.persistentAccountId || account.id;
        const mask = accountAny.mask || (accountId ? accountId.slice(-4) : '****');
        const closure = closureFor(closures, accountAny);

        return {
          id: accountId, // Use account_id/plaidAccountId as the unique identifier
          name: account.name,
          type: account.type,
          subtype: account.subtype,
          mask: mask,
          balance: {
            // Never coerce a missing balance to 0: an account the provider did not
            // report a balance for is unknown, not empty, and 0 both reads as a real
            // balance and shadows the current/available fallback on the client.
            available: account.balance?.available ?? null,
            current: account.balance?.current ?? null,
            limit: account.balance?.limit ?? null,
            iso_currency_code: account.balance?.iso_currency_code ?? 'USD',
            unofficial_currency_code: account.balance?.unofficial_currency_code ?? null
          },
          institution: account.institution,
          isClosed: closure.isClosed,
          lastSeenAt: closure.lastSeenAt
        };
      });

      console.log(`🔍 Returning ${formattedAccounts.length} Plaid accounts (filtered out ${financialData.accounts.length - plaidOnlyAccounts.length} SnapTrade accounts)`);

      res.json({ accounts: formattedAccounts });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get all accounts');
      res.status(500).json(errorResponse);
    }
  });

  // Exchange public token for access token
  app.post('/plaid/exchange_public_token', async (req: any, res: any) => {
    try {
      const { public_token } = req.body;
      console.log('Exchanging public token for access token...');

      // Debug authentication
      console.log('Exchange token - headers:', req.headers);
      console.log('Exchange token - user:', req.user);

      const exchangeResponse = await plaidClient.itemPublicTokenExchange({
        public_token: public_token,
      });

      const access_token = exchangeResponse.data.access_token;
      const item_id = exchangeResponse.data.item_id;

      console.log(`Received access token: ${access_token.substring(0, 8)}...`);
      console.log(`Item ID: ${item_id}`);

      // Store the access token and item_id in the database
      // Only update tokens we're allowed to: current user's, or unassigned (userId: null).
      // Never update another user's token - prevents ownership hijacking.
      const existingTokenWhere: { itemId: string; userId?: string | null; OR?: Array<{ userId: string | null }> } = {
        itemId: item_id
      };
      if (req.user?.id) {
        existingTokenWhere.OR = [{ userId: req.user.id }, { userId: null }];
      } else {
        existingTokenWhere.userId = null;
      }
      const existingToken = await getPrismaClient().accessToken.findFirst({
        where: existingTokenWhere
      });

      // Only include userId when authenticated - passing undefined would overwrite existing
      // user association to NULL (optionalAuth allows unauthenticated requests)
      // Clearing supersededAt is deliberate: reaching here means the user just linked this Item
      // again, so the connection is live rather than replaced. Without it, an update-mode re-auth
      // of a superseded row would come back active but stay invisible to every consumer that now
      // filters on supersededAt.
      const tokenData = {
        token: access_token,
        lastRefreshed: new Date(),
        ...(req.user?.id && { userId: req.user.id }),
        isActive: true,
        lastError: null,
        supersededAt: null
      };

      let storedToken;
      if (existingToken) {
        // Update the existing token with the new access token
        console.log(`Updating existing token for item ${item_id}`);
        storedToken = await getPrismaClient().accessToken.update({
          where: { id: existingToken.id },
          data: tokenData
        });
      } else {
        // Create a new access token
        console.log(`Creating new token for item ${item_id}`);
        storedToken = await getPrismaClient().accessToken.create({
          data: {
            ...tokenData,
            itemId: item_id
          }
        });
      }

      console.log(`Token stored with userId: ${req.user?.id || 'NO USER'}`);

      // INTELLIGENT ACCOUNT DETECTION: After successful linking, detect what's available
      // and call appropriate endpoints based on account types
      try {
        console.log('Starting intelligent account detection...');

        // Get accounts to see what types we have
        const accountsResponse = await plaidClient.accountsGet({
          access_token: access_token,
        });

        const accounts = accountsResponse.data.accounts;
        console.log(`Found ${accounts.length} accounts to analyze`);

        // RELINK RECONCILIATION: A fresh Link flow always mints a new Plaid Item, even when the
        // user is re-connecting an institution they already have. Without reconciliation the old
        // Item stays active and every logical account is counted twice. Two cases to handle:
        //   1. Update mode - the same token row was reused, so its old account_ids are now stale.
        //   2. New Item - a separate active token exists for the same institution.
        // Both use the same matcher, which only supersedes when the new Item fully covers the old.
        if (req.user?.id && accounts.length > 0) {
          let reconciliationChanged = false;
          try {
            const itemResponse = await plaidClient.itemGet({ access_token: access_token });
            const institutionId = itemResponse.data.item.institution_id;
            let institutionName: string | undefined;
            if (institutionId) {
              const institutionResponse = await plaidClient.institutionsGetById({
                institution_id: institutionId,
                country_codes: [CountryCode.Us]
              });
              institutionName = institutionResponse.data.institution?.name;
            }

            // Persist the institution on the token so duplicate connections are detectable
            // without a Plaid round-trip (previously this was only backfilled lazily).
            if (institutionName && storedToken.institutionName !== institutionName) {
              await getPrismaClient().accessToken.update({
                where: { id: storedToken.id },
                data: { institutionName }
              });
            }

            {
              const newAccountIds = new Set(accounts.map((a: any) => a.account_id));

              // Upsert the new Item's accounts so both reconciliation paths have targets. Runs even
              // when the Item reports no institution_id: Case 1 scopes by accessTokenId and needs no
              // institution. An undefined institution leaves the stored value untouched on update.
              // Only touch accounts we own or that are unassigned - never overwrite another user's.
              const accountData = (account: any) => ({
                name: account.name,
                mask: account.mask,
                type: account.type,
                subtype: account.subtype,
                currentBalance: account.balances?.current,
                availableBalance: account.balances?.available,
                limit: account.balances?.limit,
                currency: account.balances?.iso_currency_code,
                institution: institutionName,
                persistentAccountId: account.persistent_account_id || null,
                userId: req.user.id,
                accessTokenId: storedToken.id,
                lastSynced: new Date()
              });
              for (const account of accounts) {
                const existing = await getPrismaClient().account.findUnique({
                  where: { plaidAccountId: account.account_id },
                  select: { id: true, userId: true }
                });
                if (existing) {
                  if (existing.userId !== null && existing.userId !== req.user.id) {
                    console.warn(`   Skipping account ${account.account_id} - belongs to another user`);
                    continue;
                  }
                  // Preserve user-customized names on update (same as other Plaid sync paths).
                  const { name: _plaidName, ...accountFields } = accountData(account);
                  await getPrismaClient().account.update({
                    where: { id: existing.id },
                    data: accountFields
                  });
                } else {
                  await getPrismaClient().account.create({
                    data: {
                      plaidAccountId: account.account_id,
                      ...accountData(account)
                    }
                  });
                }
              }

              // Case 1: stale accounts still attached to the reused token row.
              if (existingToken) {
                const staleOwnAccounts = await getPrismaClient().account.findMany({
                  where: {
                    userId: req.user.id,
                    accessTokenId: storedToken.id,
                    plaidAccountId: { notIn: Array.from(newAccountIds) }
                  },
                  select: {
                    id: true, plaidAccountId: true, persistentAccountId: true,
                    name: true, type: true, subtype: true, mask: true, currentBalance: true,
                      balanceLastFetched: true, lastSynced: true
                  }
                });
                if (staleOwnAccounts.length > 0) {
                  const currentOwnAccounts = await getPrismaClient().account.findMany({
                    where: {
                      userId: req.user.id,
                      plaidAccountId: { in: Array.from(newAccountIds) }
                    },
                    select: {
                      id: true, plaidAccountId: true, persistentAccountId: true,
                      name: true, type: true, subtype: true, mask: true, currentBalance: true,
                      balanceLastFetched: true, lastSynced: true
                    }
                  });
                  const { matches, unmatchedPrevious } = matchAccountsAcrossConnections(
                    staleOwnAccounts.map(toConnectionAccount),
                    currentOwnAccounts.map(toConnectionAccount)
                  );
                  console.log(`Reconciling ${staleOwnAccounts.length} stale account(s) from the previous ${institutionName || 'unknown institution'} Item`);
                  if (matches.length > 0) {
                    await getPrismaClient().$transaction(async tx => {
                      for (const match of matches) {
                        // Drop the stale history rather than carrying it over: Plaid transaction ids are
                        // Item-scoped, so the replacement re-imports the same activity under new ids and
                        // persistence (keyed on plaidTransactionId) would keep both copies.
                        const dropped = await tx.transaction.deleteMany({
                          where: { accountId: match.previous.id }
                        });
                        if (dropped.count > 0) {
                          console.log(`   Dropped ${dropped.count} stale transactions from ${match.previous.name} (matched by ${match.strategy}) - the new Item re-imports them`);
                        }
                        await tx.account.delete({ where: { id: match.previous.id } });
                      }
                    });
                    reconciliationChanged = true;
                  }
                  for (const orphan of unmatchedPrevious) {
                    console.warn(`   Keeping ${orphan.name} (${orphan.type}/${orphan.subtype}) - no match in the new Item, preserving it and its history`);
                  }
                }
              }

              // Case 2: a separate active token for the same institution (fresh-Link re-connect).
              // This is the only step that needs an institution name - it is what groups connections.
              if (institutionName) {
                const { supersedeDuplicateInstitutionConnections } = await import('./services/plaid-connection-supersede');
                const supersedeReport = await supersedeDuplicateInstitutionConnections({
                  prisma: getPrismaClient() as any,
                  userId: req.user.id,
                  keepTokenId: storedToken.id,
                  institutionName,
                  log: message => console.log(message)
                });
                if (supersedeReport.superseded.length > 0) {
                  reconciliationChanged = true;
                }
              } else {
                console.warn(
                  '   Item reports no institution_id (common for some OAuth/brokerage connections) - ' +
                  'skipping cross-connection supersede. Run scripts/backfill-institution-names.js, then ' +
                  'scripts/supersede-duplicate-plaid-connections.ts, if duplicates appear.'
                );
              }
            }

            if (reconciliationChanged) {
              const { FinancialRevisionService } = await import('./services/financial-revision-service');
              FinancialRevisionService.schedule(
                req.user.id,
                {
                  categorize: false,
                  history: { kind: 'material', reason: 'account-sync' },
                },
                'exchange_public_token'
              );
            }
          } catch (cleanupErr: any) {
            console.warn('Relink reconciliation failed (non-critical):', cleanupErr?.message);
          }
        }

        // Analyze each account and call appropriate endpoints
        for (const account of accounts) {
          const accountType = account.type;
          const accountSubtype = account.subtype;

          console.log(`Analyzing account: ${account.name} (${accountType}/${accountSubtype})`);

          // For investment accounts, get holdings and transactions
          if (accountType === 'investment') {
            console.log('Investment account detected - fetching holdings and transactions');
            try {
              // Get investment holdings
              const holdingsResponse = await plaidClient.investmentsHoldingsGet({
                access_token: access_token,
              });
              console.log(`Retrieved ${holdingsResponse.data.holdings?.length || 0} investment holdings`);

              // Get investment transactions
              const transactionsResponse = await plaidClient.investmentsTransactionsGet({
                access_token: access_token,
                start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 90 days
                end_date: new Date().toISOString().split('T')[0],
              });
              console.log(`Retrieved ${transactionsResponse.data.investment_transactions?.length || 0} investment transactions`);
            } catch (error: any) {
              console.log('Investment data not available for this account:', error.message);
            }
          }

          // For credit/loan accounts, get liabilities
          if (accountType === 'credit' || accountType === 'loan') {
            console.log('Credit/Loan account detected - fetching liabilities');
            try {
              const liabilitiesResponse = await plaidClient.liabilitiesGet({
                access_token: access_token,
              });
              console.log(`Retrieved ${liabilitiesResponse.data.accounts?.length || 0} liability accounts`);
            } catch (error: any) {
              console.log('Liability data not available for this account:', error.message);
            }
          }

          // For standard deposit accounts, get transactions
          if (accountType === 'depository') {
            console.log('Depository account detected - fetching transactions');
            try {
              const transactionsResponse = await plaidClient.transactionsSync({
                access_token: access_token,
                options: {
                  include_personal_finance_category: true
                }
              });
              console.log(`Retrieved ${transactionsResponse.data.added?.length || 0} transactions`);
            } catch (error: any) {
              console.log('Transaction data not available for this account:', error.message);
            }
          }
        }

        console.log('Intelligent account detection completed successfully');
      } catch (detectionError: any) {
        // Don't fail the token exchange if detection fails
        console.log('Account detection failed (non-critical):', detectionError.message);
      }

      res.json({ access_token });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'exchanging public token');
      res.status(500).json(errorInfo);
    }
  });

  // Refresh access token - simplified approach
  app.post('/plaid/refresh_token', async (req: any, res: any) => {
    try {
      const { access_token } = req.body;

      // Test if the token is still valid by making a simple API call
      await plaidClient.accountsGet({
        access_token: access_token,
      });

      // If we get here, the token is still valid
      res.json({ valid: true, message: 'Token is still valid' });
    } catch (error) {
      // If the token is invalid, suggest reconnecting
      const errorInfo = handlePlaidError(error, 'refreshing token');
      res.status(500).json({
        ...errorInfo,
        needsReconnect: true
      });
    }
  });

  // Get accounts for a specific access token
  app.get('/plaid/accounts', async (req: any, res: any) => {
    try {
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;

      if (!accessToken) {
        return res.status(400).json({ error: 'Access token required' });
      }

      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      });

      const accounts = accountsResponse.data.accounts.map(account => ({
        id: account.account_id,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        currentBalance: account.balances.current,
      }));

      res.json({ accounts });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'fetching accounts');
      res.status(500).json(errorInfo);
    }
  });



  // Get all transactions with enhanced data
  app.get('/plaid/transactions', async (req: any, res: any) => {
    try {


            // 🔒 CRITICAL SECURITY: Require authentication for real user data
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required for accessing transaction data' });
      }

      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Authentication required for accessing transaction data' });
      }

      // Verify token and get user info
      try {
        const { verifyToken } = await import('./auth/utils');
        const payload = verifyToken(token);
        if (!payload || !payload.userId) {
          return res.status(401).json({ error: 'Authentication required for accessing transaction data' });
        }

        // Set req.user for the rest of the endpoint
        req.user = {
          id: payload.userId,
          email: payload.email || 'unknown',
          tier: payload.tier || 'starter'
        };
      } catch (error) {
        return res.status(401).json({ error: 'Authentication required for accessing transaction data' });
      }

      // ✅ PRODUCTION MODE: Use FinancialDataService as single source of truth
      const { count = '500' } = req.query;

      console.log(`🔍 /plaid/transactions: Fetching transactions using FinancialDataService for user ${req.user.id}`);

      // Use FinancialDataService to get transactions (single source of truth!)
      // ✅ Skip categorization for UI-only requests (performance optimization)
      // Only personal_finance_category is needed for UI display
      const financialDataService = new FinancialDataService();
      const financialData = await financialDataService.getUserFinancialData(req.user.id, {
        includeTransactions: true,
        includeInvestments: false,
        includeHomeValue: false,
        skipCategorization: true, // ✅ UI doesn't need full categorization, just personal_finance_category from Plaid
        shouldPersistTransactions: false // ✅ Display-only: don't persist transactions
      });

      console.log(`🔍 /plaid/transactions: FinancialDataService returned ${financialData.bankingTransactions.length} banking transactions`);

      const allTransactions: any[] = [];
      const seenTransactionIds = new Set();

      // Process transactions from FinancialDataService
      // Note: These transactions are already normalized by TransactionNormalizationService
      // which converts personal_finance_category to category and normalizes amounts
      for (const transaction of financialData.bankingTransactions) {
        try {
          // Skip duplicates
          const transactionId = transaction.transaction_id || transaction.id;
          if (seenTransactionIds.has(transactionId)) {
            continue;
          }
          seenTransactionIds.add(transactionId);

          // ✅ Transactions from FinancialDataService are already normalized!
          // No need to call processTransactionData() again - it would be redundant
          // and might overwrite the already-normalized category data
          allTransactions.push(transaction);

        } catch (error) {
          console.error(`Error processing transaction:`, error);
        }
      }

      // Skip the old enrichment logic and go straight to sorting/limiting
      /*
          // Automatically enrich transaction with merchant data
          try {

            // Map transactions for Plaid enrichment API
            const mappedTransactions = transactionsForEnrichment.map((t: any) => ({
              id: t.transaction_id,
              description: t.name,
              amount: Math.abs(t.amount), // Use absolute value for Plaid API
              direction: t.amount > 0 ? 'INFLOW' as any : 'OUTFLOW' as any,
              iso_currency_code: t.iso_currency_code || 'USD'
            }));

            // Call Plaid enrichment API
            const enrichResponse = await plaidClient.transactionsEnrich({
              account_type: 'depository',
              transactions: mappedTransactions
            });

            console.log(`✅ Transaction enrichment successful:`, {
              total: transactionsResponse.data.transactions.length,
              enrichedCount: enrichResponse.data.enriched_transactions?.length || 0,
              firstEnriched: enrichResponse.data.enriched_transactions?.[0]
            });

            // Create a map of enriched data by transaction ID
            const enrichedDataMap = new Map();
            enrichResponse.data.enriched_transactions?.forEach((enriched: any, index: number) => {
              enrichedDataMap.set(mappedTransactions[index].id, enriched);
            });

            // Merge enriched data with processed transactions
            const enrichedTransactions = processedTransactions.map((transaction) => {
              // Try to find enriched data by matching the transaction ID
              let enrichedTransaction = enrichedDataMap.get(transaction.id);

              // If not found by current ID, try to find by the original Plaid transaction ID
              if (!enrichedTransaction && (transaction as any).transaction_id) {
                enrichedTransaction = enrichedDataMap.get((transaction as any).transaction_id);
              }

              // If still not found, try to find by matching the transaction name (fallback)
              if (!enrichedTransaction) {
                for (const [key, value] of enrichedDataMap.entries()) {
                  if (value.description === transaction.name) {
                    enrichedTransaction = value;
                    break;
                  }
                }
              }

              if (enrichedTransaction) {
                // Get enhanced categories from Plaid enrichment
                let enhancedCategories = [];
                if ((enrichedTransaction as any).enrichments?.personal_finance_category) {
                  const enriched = (enrichedTransaction as any).enrichments.personal_finance_category;
                  enhancedCategories = [
                    enriched.primary,
                    enriched.detailed
                  ].filter(Boolean);
                }

                // Only show enhanced categories if they're different from basic categories
                const basicCategories = transaction.category || [];
                const hasDifferentCategories = enhancedCategories.length > 0 &&
                  (enhancedCategories.length !== basicCategories.length ||
                   !enhancedCategories.every((cat: string, index: number) => basicCategories[index] === cat));

                return {
                  ...transaction,
                  // ✅ PRESERVE original Plaid categories at the top level
                  category: basicCategories,
                  category_id: (transaction as any).category_id,
                  // ✅ Add enhanced data as additional enrichment
                  enriched_data: {
                    merchant_name: (enrichedTransaction as any).enrichments?.merchant_name || transaction.merchant_name,
                    website: (enrichedTransaction as any).enrichments?.website,
                    logo_url: (enrichedTransaction as any).enrichments?.logo_url,
                    primary_color: (enrichedTransaction as any).enrichments?.primary_color,
                    domain: (enrichedTransaction as any).enrichments?.domain,
                    // ✅ Only include enhanced categories if they're truly different
                    category: hasDifferentCategories ? enhancedCategories : [],
                    category_id: (enrichedTransaction as any).enrichments?.personal_finance_category?.primary || (transaction as any).category_id,
                    brand_logo_url: (enrichedTransaction as any).enrichments?.brand_logo_url,
                    brand_name: (enrichedTransaction as any).enrichments?.brand_name
                  }
                };
              }
              return transaction;
            });

            allTransactions.push(...enrichedTransactions);
      */ // END OF OLD ENRICHMENT CODE COMMENT

      // Sort transactions by date (newest first)
      allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Limit to requested count
      const limitedTransactions = allTransactions.slice(0, parseInt(count as string));

      // Debug: Check what we're sending to frontend
      console.log(`📤 Sending to frontend:`, {
        totalTransactions: allTransactions.length,
        limitedTransactions: limitedTransactions.length,
        sampleTransaction: limitedTransactions[0],
        hasEnrichedData: limitedTransactions[0]?.enriched_data ? 'YES' : 'NO',
        enrichedFields: limitedTransactions[0]?.enriched_data ? Object.keys(limitedTransactions[0].enriched_data) : 'NONE',
        // Debug merchant name consistency
        merchantNameDebug: limitedTransactions[0] ? {
          originalName: limitedTransactions[0].name,
          merchantName: limitedTransactions[0].merchant_name,
          enrichedMerchantName: limitedTransactions[0].enriched_data?.merchant_name,
          allNames: [
            limitedTransactions[0].name,
            limitedTransactions[0].merchant_name,
            limitedTransactions[0].enriched_data?.merchant_name
          ].filter(Boolean)
        } : 'No transactions'
      });

      res.json({ transactions: limitedTransactions });

    } catch (error) {
      console.error('Error in /plaid/transactions endpoint:', error);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  // Get comprehensive investment data (automatically combines holdings and transactions)
  app.get('/plaid/investments', async (req: any, res: any) => {
    try {


      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing investment data' });
      }

      // ✅ Use unified FinancialDataService for consistent data
      const { FinancialDataService } = await import('./services/financial-data-service');
      const financialDataService = new FinancialDataService();

      const financialData = await financialDataService.getUserFinancialData(req.user.id, {
        includeTransactions: true, // ✅ Include investment transactions for the Transactions tab
        includeInvestments: true,
        includeHomeValue: false,
        skipCategorization: true, // ✅ UI doesn't need full categorization, just personal_finance_category from Plaid
        shouldPersistTransactions: false // ✅ Display-only: don't persist transactions
      });

      // Return investment data in the format expected by frontend
      res.json({
        portfolio: financialData.investments.portfolio,
        holdings: financialData.investments.holdings,
        transactions: financialData.investments.transactions
      });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get investments');
      res.status(500).json(errorResponse);
    }
  });

  // Note: Income API might not be available in all Plaid environments
  // This endpoint is commented out until we verify availability
  /*
  app.get('/plaid/income', async (req: any, res: any) => {
    try {
      const accessTokens = await getPrismaClient().accessToken.findMany();
      const allIncome: any[] = [];

      for (const tokenRecord of accessTokens) {
        try {
          const incomeResponse = await plaidClient.incomeGet({
            access_token: tokenRecord.token,
          });

          allIncome.push({
            income: incomeResponse.data.income,
            request_id: incomeResponse.data.request_id
          });
        } catch (error) {
          console.error(`Error fetching income for token ${tokenRecord.id}:`, error);
        }
      }

      res.json({ income: allIncome });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get income');
      res.status(500).json(errorResponse);
    }
  });
  */


  // Sync accounts
  app.post('/plaid/sync_accounts', async (req: any, res: any) => {
    try {
      // Require user authentication
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { access_token } = req.body;
      if (!access_token) return res.status(400).json({ error: 'Access token required' });
      const tokenRecord = await getPrismaClient().accessToken.findFirst({
        where: { token: access_token, userId: user.id, isActive: true },
        select: { id: true },
      });
      if (!tokenRecord) return res.status(404).json({ error: 'Plaid connection not found' });
      const accountsResponse = await plaidClient.accountsGet({
        access_token: access_token,
      });

      const accounts = accountsResponse.data.accounts;
      let count = 0;

      for (const account of accounts) {
        await getPrismaClient().account.upsert({
          where: { plaidAccountId: account.account_id },
          update: {
            // Don't update name - preserve user customizations
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code,
            persistentAccountId: (account as any).persistent_account_id || null,
            userId: user.id, // Associate with authenticated user
            accessTokenId: tokenRecord.id,
          },
          create: {
            plaidAccountId: account.account_id,
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code,
            persistentAccountId: (account as any).persistent_account_id || null,
            userId: user.id, // Associate with authenticated user
            accessTokenId: tokenRecord.id,
          },
        });
        count++;
      }

      res.json({ success: true, count });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'syncing accounts');
      res.status(500).json(errorInfo);
    }
  });

  // Sync transactions using transactionsSync API with cursor tracking
  app.post('/plaid/sync_transactions', async (req: any, res: any) => {
    try {
      const { access_token } = req.body;

      if (!access_token) {
        return res.status(400).json({ error: 'Access token required' });
      }
      if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
      const ownsConnection = await getPrismaClient().accessToken.count({
        where: { token: access_token, userId: req.user.id, isActive: true },
      });
      if (!ownsConnection) return res.status(404).json({ error: 'Plaid connection not found' });

      // Use TransactionSyncService to sync transactions with cursor management
      const result = await TransactionSyncService.syncTransactionsForToken(access_token);

      if (result.success) {
        // Optionally compute and return a fresh snapshot for the authenticated user
        let snapshot: any = null;
        try {
          if (req.user?.id) {
            const { FinancialRevisionService } = await import('./services/financial-revision-service');
            // Fast path to avoid long request times; cron will run full categorization
            snapshot = await FinancialRevisionService.recompute(req.user.id, {
              categorize: false,
              history: { kind: 'material', reason: 'account-sync' },
            });
          }
        } catch (e) {
          console.warn('sync_transactions: snapshot refresh failed (non-fatal):', e);
        }
        res.json({
          success: true,
          added: result.added,
          modified: result.modified,
          removed: result.removed,
          total: result.added + result.modified + result.removed,
          snapshot
        });
      } else {
        const errorInfo = handlePlaidError(new Error(result.error || 'Transaction sync failed'), 'syncing transactions');
        res.status(500).json(errorInfo);
      }
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'syncing transactions');
      res.status(500).json(errorInfo);
    }
  });

  // Refresh data endpoint
  app.post('/plaid/refresh_data', async (req: any, res: any) => {
    try {
      const { access_token } = req.body;
      if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
      if (!access_token) return res.status(400).json({ error: 'Access token required' });
      const tokenRecord = await getPrismaClient().accessToken.findFirst({
        where: { token: access_token, userId: req.user.id, isActive: true },
        select: { id: true },
      });
      if (!tokenRecord) return res.status(404).json({ error: 'Plaid connection not found' });

      // Refresh accounts
      const accountsResponse = await plaidClient.accountsGet({
        access_token: access_token,
      });

      const accounts = accountsResponse.data.accounts;
      let accountCount = 0;

      for (const account of accounts) {
        await getPrismaClient().account.upsert({
          where: { plaidAccountId: account.account_id },
          update: {
            // Don't update name - preserve user customizations
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code,
            persistentAccountId: (account as any).persistent_account_id || null,
            userId: req.user.id,
            accessTokenId: tokenRecord.id,
          },
          create: {
            plaidAccountId: account.account_id,
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            currentBalance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code,
            persistentAccountId: (account as any).persistent_account_id || null,
            userId: req.user.id,
            accessTokenId: tokenRecord.id,
          },
        });
        accountCount++;
      }

      const transactionSync = await TransactionSyncService.syncTransactionsForToken(access_token);
      if (!transactionSync.success) throw new Error(transactionSync.error || 'Transaction sync failed');
      const transactionCount = transactionSync.added + transactionSync.modified + transactionSync.removed;

      res.json({
        success: true,
        accountsRefreshed: accountCount,
        transactionsRefreshed: transactionCount
      });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'refreshing data');
      res.status(500).json(errorInfo);
    }
  });

  // Disconnect accounts endpoint
  app.delete('/plaid/disconnect_accounts', async (req: any, res: any) => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
      await getPrismaClient().accessToken.deleteMany({ where: { userId: req.user.id } });

      res.json({ success: true, message: 'All accounts disconnected' });
    } catch (error) {
      const errorInfo = handlePlaidError(error, 'disconnecting accounts');
      res.status(500).json(errorInfo);
    }
  });

  // ============================================================================
  // ENHANCED PLAID ENDPOINTS - NEW FEATURES
  // ============================================================================

  // Get investment holdings for all connected accounts
  app.get('/plaid/investments/holdings', async (req: any, res: any) => {
    try {


      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing investment holdings data' });
      }

      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });

      const allHoldings: any[] = [];

      for (const tokenRecord of accessTokens) {
        try {
          const holdingsResponse = await plaidClient.investmentsHoldingsGet({
            access_token: tokenRecord.token,
          });

          // Process and analyze the data
          const processedHoldings = holdingsResponse.data.holdings.map(processInvestmentHolding);
          const processedSecurities = holdingsResponse.data.securities.map(processSecurity);

                // Generate portfolio analysis
      const portfolioAnalysis = analyzePortfolio(processedHoldings, processedSecurities);

      allHoldings.push({
        holdings: processedHoldings,
        securities: processedSecurities,
        accounts: holdingsResponse.data.accounts,
        item: holdingsResponse.data.item,
        analysis: portfolioAnalysis
      });

      // Enhance user profile with investment data (if user is authenticated)
      if (req.user?.id) {
        try {
          await enhanceProfileWithInvestmentData(
            req.user.id,
            processedHoldings,
            [] // No transactions in this endpoint
          );
        } catch (profileError) {
          console.error('Error enhancing profile with investment data:', profileError);
          // Don't fail the request if profile enhancement fails
        }
      }
        } catch (error) {
          console.error(`Error fetching holdings for token ${tokenRecord.id}:`, error);
        }
      }

      // ✅ FIXED: Calculate combined portfolio analysis for accurate totals
      const combinedHoldings = allHoldings.flatMap(h => h.holdings);
      const combinedSecurities = allHoldings.flatMap(h => h.securities);
      const combinedPortfolioAnalysis = analyzePortfolio(combinedHoldings, combinedSecurities);

      res.json({
        holdings: allHoldings,
        summary: {
          totalAccounts: allHoldings.length,
          totalHoldings: combinedHoldings.length,
          totalSecurities: combinedSecurities.length,
          totalPortfolioValue: combinedPortfolioAnalysis.totalValue
        },
        // ✅ NEW: Add combined portfolio analysis for frontend consistency
        combinedPortfolio: combinedPortfolioAnalysis
      });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get investment holdings');
      res.status(500).json(errorResponse);
    }
  });

  // Get investment transactions
  app.get('/plaid/investments/transactions', async (req: any, res: any) => {
    try {


      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing investment transaction data' });
      }

      const { start_date, end_date, count = 100 } = req.query;
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });

      const allTransactions: any[] = [];

      for (const tokenRecord of accessTokens) {
        try {
          const transactionsResponse = await plaidClient.investmentsTransactionsGet({
            access_token: tokenRecord.token,
            start_date: start_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: end_date || new Date().toISOString().split('T')[0],
          });

          // Process and analyze the data
          const processedTransactions = transactionsResponse.data.investment_transactions.map(processInvestmentTransaction);
          const processedSecurities = transactionsResponse.data.securities.map(processSecurity);

                // Generate activity analysis
      const activityAnalysis = analyzeInvestmentActivity(processedTransactions);

      allTransactions.push({
        investment_transactions: processedTransactions,
        total_investment_transactions: transactionsResponse.data.total_investment_transactions,
        accounts: transactionsResponse.data.accounts,
        securities: processedSecurities,
        item: transactionsResponse.data.item,
        analysis: activityAnalysis
      });

      // Enhance user profile with investment data (if user is authenticated)
      if (req.user?.id) {
        try {
          await enhanceProfileWithInvestmentData(
            req.user.id,
            [], // No holdings in this endpoint
            processedTransactions
          );
        } catch (profileError) {
          console.error('Error enhancing profile with investment data:', profileError);
          // Don't fail the request if profile enhancement fails
        }
      }
        } catch (error) {
          console.error(`Error fetching investment transactions for token ${tokenRecord.id}:`, error);
        }
      }

      // Sort transactions by date (newest first)
      const sortedTransactions = allTransactions.flatMap(t => t.investment_transactions)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, parseInt(count as string));

      res.json({
        transactions: allTransactions,
        sortedTransactions: sortedTransactions,
        summary: {
          totalAccounts: allTransactions.length,
          totalTransactions: allTransactions.reduce((sum, t) => sum + t.investment_transactions.length, 0),
          totalSecurities: allTransactions.reduce((sum, t) => sum + t.securities.length, 0),
          dateRange: {
            start_date: start_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: end_date || new Date().toISOString().split('T')[0]
          }
        }
      });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get investment transactions');
      res.status(500).json(errorResponse);
    }
  });

  // Get liability information (automatically available for all connected accounts)
  app.get('/plaid/liabilities', async (req: any, res: any) => {
    try {


      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for accessing liability data' });
      }

      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });

      const allLiabilities: any[] = [];

      for (const tokenRecord of accessTokens) {
        try {
          const liabilitiesResponse = await plaidClient.liabilitiesGet({
            access_token: tokenRecord.token,
          });

          // Get institution information
          let institutionName = 'Unknown Institution';
          try {
            if (liabilitiesResponse.data.item?.institution_id) {
              const institutionResponse = await plaidClient.institutionsGetById({
                institution_id: liabilitiesResponse.data.item.institution_id,
                country_codes: [CountryCode.Us]
              });
              institutionName = institutionResponse.data.institution.name;
            }
          } catch (institutionError) {
            console.log('Could not fetch institution name for liabilities, using default');
          }

          // Add institution information to accounts
          const accountsWithInstitution = liabilitiesResponse.data.accounts.map((account: any) => ({
            ...account,
            institution: institutionName
          }));

          allLiabilities.push({
            accounts: accountsWithInstitution,
            item: liabilitiesResponse.data.item,
            request_id: liabilitiesResponse.data.request_id
          });

          // Enhance user profile with liability data (if user is authenticated)
          if (req.user?.id) {
            try {
              await enhanceProfileWithLiabilityData(
                req.user.id,
                liabilitiesResponse.data.accounts
              );
            } catch (profileError) {
              console.error('Error enhancing profile with liability data:', profileError);
              // Don't fail the request if profile enhancement fails
            }
          }
        } catch (error) {
          console.error(`Error fetching liabilities for token ${tokenRecord.id}:`, error);
        }
      }

      res.json({ liabilities: allLiabilities });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'get liabilities');
      res.status(500).json(errorResponse);
    }
  });

  // Enrich transactions with merchant data (now automatic in /transactions endpoint)
  app.post('/plaid/enrich/transactions', async (req: any, res: any) => {
    try {
      // 🔒 CRITICAL SECURITY: Require authentication for real user data
      if (!req.user?.id) {
        return res.status(400).json({ error: 'Authentication required for accessing transaction enrichment data' });
      }

      const { transaction_ids, account_type = 'depository' } = req.body;

      if (!transaction_ids || !Array.isArray(transaction_ids)) {
        return res.status(400).json({ error: 'transaction_ids array required' });
      }

      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: req.user.id }
      });

      const allEnrichments: any[] = [];

      for (const tokenRecord of accessTokens) {
        try {
          // For transaction enrichment, we need to provide the full transaction data
          // Since we only have transaction IDs, we'll need to fetch the transaction details first
          // For now, we'll create a minimal structure - in production, you'd want to fetch the full transaction data
          const enrichResponse = await plaidClient.transactionsEnrich({
            account_type: account_type,
            transactions: transaction_ids.map((id: string) => ({
              id: id,
              description: `Transaction ${id}`,
              amount: 0, // This would need to be fetched from the actual transaction
              direction: 'OUTFLOW' as any, // Default direction
              iso_currency_code: 'USD'
            }))
          });

          allEnrichments.push({
            enriched_transactions: enrichResponse.data.enriched_transactions,
            request_id: enrichResponse.data.request_id
          });

          // Enhance user profile with enrichment data (if user is authenticated)
          if (req.user?.id) {
            try {
              await enhanceProfileWithEnrichmentData(
                req.user.id,
                enrichResponse.data.enriched_transactions
              );
            } catch (profileError) {
              console.error('Error enhancing profile with enrichment data:', profileError);
              // Don't fail the request if profile enhancement fails
            }
          }
        } catch (error) {
          console.error(`Error enriching transactions for token ${tokenRecord.id}:`, error);
        }
      }

      res.json({ enrichments: allEnrichments });
    } catch (error) {
      const errorResponse = handlePlaidError(error, 'enrich transactions');
      res.status(500).json(errorResponse);
    }
  });

  // Check access token products and scope
  app.get('/plaid/check-token-scope', async (req: any, res: any) => {
    try {
      // Require user authentication
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get access tokens for the user
      const accessTokens = await getPrismaClient().accessToken.findMany({
        where: { userId: user.id }
      });

      if (accessTokens.length === 0) {
        return res.status(404).json({ error: 'No access tokens found for user' });
      }

      const tokenInfo = [];

      for (const tokenRecord of accessTokens) {
        try {
          // Get item information to check products
          const itemResponse = await plaidClient.itemGet({
            access_token: tokenRecord.token,
          });

          // Get accounts to see what types are available
          const accountsResponse = await plaidClient.accountsGet({
            access_token: tokenRecord.token,
          });

          const item = itemResponse.data.item;
          const accounts = accountsResponse.data.accounts;

          tokenInfo.push({
            tokenId: tokenRecord.id,
            itemId: item.item_id,
            institutionId: item.institution_id,
            products: item.available_products || [],
            webhook: item.webhook,
            accounts: accounts.map((acc: any) => ({
              id: acc.account_id,
              name: acc.name,
              type: acc.type,
              subtype: acc.subtype,
              mask: acc.mask
            })),
            hasInvestments: accounts.some((acc: any) =>
              acc.type === 'investment' ||
              acc.subtype === 'investment' ||
              acc.subtype === '401k' ||
              acc.subtype === 'ira' ||
              acc.subtype === 'brokerage'
            )
          });
        } catch (error: any) {
          console.error('Error checking token:', error);
          tokenInfo.push({
            tokenId: tokenRecord.id,
            error: error.message || 'Unknown error',
            hasInvestments: false
          });
        }
      }

      res.json({
        message: 'Token scope information retrieved',
        tokens: tokenInfo,
        summary: {
          totalTokens: tokenInfo.length,
          tokensWithInvestments: tokenInfo.filter(t => t.hasInvestments).length,
          tokensWithErrors: tokenInfo.filter(t => t.error).length
        }
      });

    } catch (error) {
      const errorResponse = handlePlaidError(error, 'check token scope');
      res.status(500).json(errorResponse);
    }
  });

  // NEW: Comprehensive sync endpoint - intelligently pulls all available data
  // Strategy: /accounts/get to see what they actually linked, then branch based on account types
  app.post('/plaid/sync', async (req: any, res: any) => {
    try {
      const { needRealtimeBalance } = req.body as { needRealtimeBalance?: boolean };
      const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;

      if (!accessToken) {
        return res.status(400).json({ error: 'Access token required' });
      }

      console.log('Starting comprehensive sync for access token...');

      // Get accounts to see what types we have
      const accountsResponse = await plaidClient.accountsGet({
        access_token: accessToken,
      });

      const accounts = accountsResponse.data.accounts;
      console.log(`Found ${accounts.length} accounts to sync`);

      // Quick feature detection
      const hasInvestment = accounts.some((a: any) => a.type === 'investment');
      const hasCreditOrLoan = accounts.some((a: any) => a.type === 'credit' || a.type === 'loan');
      const hasDepository = accounts.some((a: any) => a.type === 'depository');

      const result: any = {
        accountsSummary: accounts.map((a: any) => ({
          account_id: a.account_id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          mask: a.mask,
        }))
      };

      // Investments
      if (hasInvestment) {
        console.log('Investment accounts detected - fetching holdings and transactions');
        try {
          const holdings = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
          const invTx = await plaidClient.investmentsTransactionsGet({
            access_token: accessToken,
            start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 90 days
            end_date: new Date().toISOString().split('T')[0],
          });

          result.investments = {
            holdings: holdings.data.holdings,
            securities: holdings.data.securities,
            transactions: invTx.data.investment_transactions,
          };

          console.log(`Retrieved ${holdings.data.holdings?.length || 0} holdings and ${invTx.data.investment_transactions?.length || 0} transactions`);
        } catch (error: any) {
          console.log('Investment data not available:', error.message);
          result.investments = { error: 'Investment data not available' };
        }
      }

      // Liabilities (credit cards, student loans, mortgages)
      if (hasCreditOrLoan) {
        console.log('Credit/Loan accounts detected - fetching liabilities');
        try {
          const liab = await plaidClient.liabilitiesGet({ access_token: accessToken });
          result.liabilities = liab.data.liabilities;
          console.log(`Retrieved ${liab.data.accounts?.length || 0} liability accounts`);
        } catch (error: any) {
          console.log('Liability data not available:', error.message);
          result.liabilities = { error: 'Liability data not available' };
        }
      }

      // Banking transactions (checking/savings)
      if (hasDepository) {
        console.log('Depository accounts detected - fetching transactions');
        try {
          // Use /transactions/sync, not /transactions/get
          let cursor: string | null = null;
          const added: any[] = [];
          const modified: any[] = [];
          const removed: any[] = [];
          let hasMore = true;

          while (hasMore) {
            const syncResp = await plaidClient.transactionsSync({
              access_token: accessToken,
              cursor: cursor || undefined,
            });
            added.push(...syncResp.data.added);
            modified.push(...syncResp.data.modified);
            removed.push(...syncResp.data.removed);
            cursor = syncResp.data.next_cursor;
            hasMore = syncResp.data.has_more;
          }

          result.transactions = { added, modified, removed, cursor };
          console.log(`Retrieved ${added.length} transactions`);
        } catch (error: any) {
          console.log('Transaction data not available:', error.message);
          result.transactions = { error: 'Transaction data not available' };
        }
      }

      // Real-time balances (only if you actually need them)
      if (needRealtimeBalance) {
        console.log('Fetching real-time balances...');
        try {
          // Use BalanceService with force refresh for real-time data
          const balancesData = await BalanceService.getAccountBalances(
            accessToken,
            plaidClient,
            true // Force refresh for real-time data
          );
          result.realtimeBalances = balancesData.map((balance: any) => ({
            account_id: balance.account_id,
            available: balance.available,
            current: balance.current,
            iso_currency_code: balance.iso_currency_code,
          }));
          console.log(`Retrieved real-time balances for ${result.realtimeBalances.length} accounts`);
        } catch (error: any) {
          console.log('Real-time balance data not available:', error.message);
          result.realtimeBalances = { error: 'Real-time balance data not available' };
        }
      }

      console.log('Comprehensive sync completed successfully');
      res.json(result);

    } catch (error: any) {
      // If you forgot to include a product in additional_consented_products,
      // certain calls can fail here with consent errors → you'd need Update Mode.
      console.error('Sync failed:', error?.response?.data || error);
      res.status(500).json({
        error: 'SYNC_FAILED',
        details: error?.response?.data || error?.message || 'Unknown error'
      });
    }
  });

  // Manual balance refresh endpoint (for testing and emergency use)
  app.post('/plaid/refresh-balances', async (req: any, res: any) => {
    try {
      // 🔒 CRITICAL SECURITY: Require authentication
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for balance refresh' });
      }

      console.log(`🔄 Manual balance refresh requested by user ${req.user.id}`);

      // Refresh balances for the authenticated user
      await BalanceService.refreshAllUserBalances(req.user.id, plaidClient);

      // Get cache stats for monitoring
      const cacheStats = await BalanceService.getCacheStats();

      res.json({
        success: true,
        message: 'Balances refreshed successfully',
        timestamp: new Date().toISOString(),
        cacheStats: {
          size: cacheStats.size,
          keys: cacheStats.keys.slice(0, 5) // Show first 5 keys for debugging
        }
      });

    } catch (error: any) {
      console.error('Manual balance refresh failed:', error);
      res.status(500).json({
        success: false,
        error: 'BALANCE_REFRESH_FAILED',
        message: error?.message || 'Unknown error occurred during balance refresh'
      });
    }
  });

  // Balance cache management endpoint (for monitoring)
  app.get('/plaid/balance-cache-stats', async (req: any, res: any) => {
    try {
      const cacheStats = await BalanceService.getCacheStats();

      res.json({
        success: true,
        cacheStats,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Failed to get cache stats:', error);
      res.status(500).json({
        success: false,
        error: 'CACHE_STATS_FAILED',
        message: error?.message || 'Unknown error occurred'
      });
    }
  });

  // Clear balance cache endpoint (for debugging)
  app.post('/plaid/clear-balance-cache', async (req: any, res: any) => {
    try {
      // 🔒 CRITICAL SECURITY: Require authentication
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required for cache clearing' });
      }

      console.log(`🗑️ Balance cache clear requested by user ${req.user.id}`);

      await BalanceService.clearCache();

      res.json({
        success: true,
        message: 'Balance cache cleared successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Failed to clear balance cache:', error);
      res.status(500).json({
        success: false,
        error: 'CACHE_CLEAR_FAILED',
        message: error?.message || 'Unknown error occurred during cache clearing'
      });
    }
  });
};
