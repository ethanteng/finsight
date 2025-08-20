import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { 
  anonymizeAccountData, 
  anonymizeTransactionData, 
  anonymizeInvestmentData,
  anonymizeLiabilityData,
  anonymizeEnhancedTransactionData,
  anonymizeConversationHistory, 
  tokenizeAccount, 
  tokenizeMerchant 
} from './privacy';
import { dataOrchestrator, TierAwareContext } from './data/orchestrator';
import { UserTier } from './data/types';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Safety check: Prevent real OpenAI API calls in test/CI environments
if (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) {
  console.log('OpenAI: Test/CI environment detected - using mock responses');
}
const prisma = new PrismaClient();

// Helper function to get Plaid credentials based on mode
const getPlaidCredentials = () => {
  const plaidMode = process.env.PLAID_MODE || 'sandbox';
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

interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

// Simple regex-based formatting function (alternative to GPT formatting)
function formatResponseWithRegex(rawResponse: string): string {
  return rawResponse
    // Fix bullet lists - ensure bullet and text are on same line
    .replace(/(\n)(\s*[-*+]\s*)(\n)(\s*)/g, '\n$2')
    .replace(/([-*+])\s*\n\s*(.+)/g, '$1 $2')
    
    // Fix numbered lists - ensure number and text are on same line
    .replace(/(\n)(\s*\d+\.\s*)(\n)(\s*)/g, '\n$2')
    .replace(/(\d+\.)\s*\n\s*(.+)/g, '$1 $2')
    
    // Remove extra blank lines between list items
    .replace(/([-*+] .+)\n\n(?=[-*+] )/g, '$1\n')
    .replace(/(\d+\. .+)\n\n(?=\d+\. )/g, '$1\n')
    
    // Ensure proper spacing around headers
    .replace(/(\n)(#{1,6}\s)/g, '\n\n$2')
    
    // Ensure proper spacing around code blocks
    .replace(/(\n)(```)/g, '\n\n$2')
    
    // Fix multiple consecutive line breaks
    .replace(/\n{3,}/g, '\n\n')
    
    // Remove extra spaces at beginning of lines
    .replace(/^\s+/gm, '')
    
    // Ensure consistent list formatting
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/^\s*\d+\.\s+/gm, (match) => {
      const number = match.match(/\d+/)?.[0] || '1';
      return `${number}. `;
    })
    
    // Clean up any remaining formatting issues
    .trim();
}



// Enhanced post-processing function with tier-aware upgrade suggestions
function enhanceResponseWithUpgrades(answer: string, tierContext: TierAwareContext, searchContext?: string): string {
  // Don't add upgrade suggestions if search context is available (user already has access to real-time data)
  if (searchContext || tierContext.upgradeHints.length === 0) {
    return answer;
  }

  const upgradeSection = `

> **💡 Want more insights?** Upgrade your plan to access:
> 
> ${tierContext.upgradeHints.map(hint => `> • **${hint.feature}**: ${hint.benefit}`).join('\n')}
> 
> *Your current tier: ${tierContext.tierInfo.currentTier}*
`;

  return answer + upgradeSection;
}

/**
 * Enhanced OpenAI function with proactive market context caching
 * This version uses pre-processed market context for faster responses
 */
export async function askOpenAIWithEnhancedContext(
  question: string, 
  conversationHistory: Conversation[] = [], 
  userTier: UserTier | string = UserTier.STARTER, 
  isDemo: boolean = false, 
  userId?: string,
  model?: string,
  demoProfile?: string
): Promise<string> {
  // Convert string tier to enum if needed
  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;

  console.log('OpenAI Enhanced: Starting enhanced context request for tier:', tier, 'isDemo:', isDemo);

  // Get user-specific data
  let accounts: any[] = [];
  let transactions: any[] = [];
  let investmentData: any = null;

  // For demo mode, use demo data instead of database data
  if (isDemo) {
    console.log('OpenAI Enhanced: Using demo data for accounts, transactions, and investments');
    try {
      const { demoData } = await import('./demo-data');
      accounts = demoData.accounts || [];
      transactions = demoData.transactions || [];
      
      // Demo investment data
      investmentData = {
        portfolio: {
          totalValue: 619951.34,
          assetAllocation: [
            { type: 'Stocks', value: 450000, percentage: 72.6 },
            { type: 'Bonds', value: 120000, percentage: 19.4 },
            { type: 'Cash', value: 49951.34, percentage: 8.0 }
          ],
          holdingCount: 60,
          securityCount: 26
        },
        holdings: [
          {
            id: 'demo_account_1_security_1_100_50000',
            account_id: 'demo_account_1',
            security_id: 'demo_security_1',
            institution_value: 50000,
            institution_price: 500.00,
            institution_price_as_of: new Date().toISOString(),
            cost_basis: 48000,
            quantity: 100,
            iso_currency_code: 'USD',
            security_name: 'Apple Inc. (AAPL)',
            security_type: 'equity',
            ticker_symbol: 'AAPL'
          },
          {
            id: 'demo_account_1_security_2_200_75000',
            account_id: 'demo_account_1',
            security_id: 'demo_security_2',
            institution_value: 75000,
            institution_price: 375.00,
            institution_price_as_of: new Date().toISOString(),
            cost_basis: 70000,
            quantity: 200,
            iso_currency_code: 'USD',
            security_name: 'Microsoft Corporation (MSFT)',
            security_type: 'equity',
            ticker_symbol: 'MSFT'
          }
        ]
      };
      
      console.log('OpenAI Enhanced: Demo data loaded - accounts:', accounts.length, 'transactions:', transactions.length, 'investments:', investmentData ? 'available' : 'none');
    } catch (error) {
      console.error('OpenAI Enhanced: Error loading demo data:', error);
    }
  } else {
    // For authenticated users, fetch from database first, then Plaid if needed
    try {
      if (userId) {
        console.log('OpenAI Enhanced: Fetching user-specific data for userId:', userId);
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        // First try to get data from database
        accounts = await prisma.account.findMany({
          where: { userId },
          include: { transactions: true }
        });
        
        transactions = await prisma.transaction.findMany({
          where: { account: { userId } },
          orderBy: { date: 'desc' },
          take: 50
        });
        
        console.log('OpenAI Enhanced: Found', accounts.length, 'accounts and', transactions.length, 'transactions in database for user', userId);
        
        // If no data in database, try to fetch from Plaid directly
        if (accounts.length === 0 || transactions.length === 0) {
          console.log('OpenAI Enhanced: No data in database, fetching from Plaid directly');
          
          // CRITICAL SECURITY FIX: Never call Plaid APIs in demo mode
          if (isDemo) {
            console.log('OpenAI Enhanced: DEMO MODE - Skipping Plaid API calls for security');
          } else {
            try {
              // Import Plaid functions directly
              const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
              
              const credentials = getPlaidCredentials();
              const configuration = new Configuration({
                basePath: PlaidEnvironments[credentials.env],
                baseOptions: {
                  headers: {
                    'PLAID-CLIENT-ID': credentials.clientId,
                    'PLAID-SECRET': credentials.secret,
                  },
                },
              });
              
              const plaidClient = new PlaidApi(configuration);
              
              // Get access tokens for the current user only
              const accessTokens = await prisma.accessToken.findMany({
                where: { userId }
              });
              
              if (accessTokens.length > 0) {
                console.log('OpenAI Enhanced: Found', accessTokens.length, 'access tokens for user', userId);
                
                // Fetch accounts from all tokens
                for (const tokenRecord of accessTokens) {
                  try {
                    const accountsResponse = await plaidClient.accountsGet({
                      access_token: tokenRecord.token,
                    });
                    
                    const balancesResponse = await plaidClient.accountsBalanceGet({
                      access_token: tokenRecord.token,
                    });
                    
                    // Merge account and balance data
                    const accountsWithBalances = accountsResponse.data.accounts.map((account: any) => {
                      const balance = balancesResponse.data.accounts.find((b: any) => b.account_id === account.account_id);
                      return {
                        id: account.account_id,
                        name: account.name,
                        type: account.type,
                        subtype: account.subtype,
                        balance: {
                          available: balance?.balances?.available || account.balances?.available,
                          current: balance?.balances?.current || account.balances?.current,
                          limit: balance?.balances?.limit || account.balances?.limit,
                          iso_currency_code: balance?.balances?.iso_currency_code || account.balances?.iso_currency_code,
                          unofficial_currency_code: balance?.balances?.unofficial_currency_code || account.balances?.unofficial_currency_code
                        }
                      };
                    });
                    
                    accounts.push(...accountsWithBalances);
                    console.log('OpenAI Enhanced: Fetched', accountsWithBalances.length, 'accounts from Plaid');
                  } catch (error) {
                    console.error('OpenAI Enhanced: Error fetching accounts from token:', error);
                  }
                }
                
                // Fetch transactions from all tokens
                for (const tokenRecord of accessTokens) {
                  try {
                    const endDate = new Date().toISOString().split('T')[0];
                    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    
                    const transactionsResponse = await plaidClient.transactionsGet({
                      access_token: tokenRecord.token,
                      start_date: startDate,
                      end_date: endDate,
                      options: {
                        count: 50,
                        include_personal_finance_category: true
                      }
                    });
                    
                    const processedTransactions = transactionsResponse.data.transactions.map((transaction: any) => ({
                      id: transaction.transaction_id,
                      account_id: transaction.account_id,
                      amount: transaction.amount,
                      date: transaction.date,
                      name: transaction.name,
                      merchant_name: transaction.merchant_name,
                      category: transaction.category,
                      category_id: transaction.category_id,
                      pending: transaction.pending,
                      payment_channel: transaction.payment_channel,
                      location: transaction.location,
                      payment_meta: transaction.payment_meta,
                      pending_transaction_id: transaction.pending_transaction_id,
                      account_owner: transaction.account_owner,
                      transaction_code: transaction.transaction_code
                    }));
                    
                    transactions.push(...processedTransactions);
                    console.log('OpenAI Enhanced: Fetched', processedTransactions.length, 'transactions from Plaid');
                  } catch (error) {
                    console.error('OpenAI Enhanced: Error fetching transactions from token:', error);
                  }
                }
                
                // Fetch investment data from all tokens
                for (const tokenRecord of accessTokens) {
                  try {
                    console.log('OpenAI Enhanced: Fetching investment data from Plaid for token');
                    
                    // Fetch holdings (this also includes securities data)
                    const holdingsResponse = await plaidClient.investmentsHoldingsGet({
                      access_token: tokenRecord.token,
                    });
                    
                    // Process and merge the data
                    const processedHoldings = holdingsResponse.data.holdings.map((holding: any) => ({
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
                    }));
                    
                    const processedSecurities = holdingsResponse.data.securities.map((security: any) => ({
                      id: security.security_id,
                      security_id: security.security_id,
                      name: security.name,
                      ticker_symbol: security.ticker_symbol,
                      type: security.type,
                      close_price: security.close_price,
                      close_price_as_of: security.close_price_as_of,
                      iso_currency_code: security.iso_currency_code,
                      unofficial_currency_code: security.unofficial_currency_code
                    }));
                    
                    // Merge security information with holdings
                    const securitiesMap = new Map(processedSecurities.map((sec: any) => [sec.security_id, sec]));
                    const enrichedHoldings = processedHoldings.map(holding => ({
                      ...holding,
                      security_name: securitiesMap.get(holding.security_id)?.name || 'Unknown Security',
                      security_type: securitiesMap.get(holding.security_id)?.type || 'Unknown',
                      ticker_symbol: securitiesMap.get(holding.security_id)?.ticker_symbol || 'N/A'
                    }));
                    
                    // Calculate portfolio summary
                    const totalValue = enrichedHoldings.reduce((sum, holding) => sum + (holding.institution_value || 0), 0);
                    const assetTypes = new Map<string, number>();
                    
                    enrichedHoldings.forEach(holding => {
                      const type = holding.security_type || 'Unknown';
                      assetTypes.set(type, (assetTypes.get(type) || 0) + (holding.institution_value || 0));
                    });
                    
                    const assetAllocation = Array.from(assetTypes.entries()).map(([type, value]: [string, number]) => ({
                      type,
                      value,
                      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
                    }));
                    
                    investmentData = {
                      portfolio: {
                        totalValue,
                        assetAllocation,
                        holdingCount: enrichedHoldings.length,
                        securityCount: processedSecurities.length
                      },
                      holdings: enrichedHoldings
                    };
                    
                    console.log('OpenAI Enhanced: Fetched investment data - total value:', totalValue, 'holdings:', enrichedHoldings.length);
                    break; // Only need to fetch from one token since investments are typically consolidated
                  } catch (error) {
                    console.error('OpenAI Enhanced: Error fetching investment data from token:', error);
                    // Continue to next token if this one fails
                  }
                }
              }
            } catch (plaidError) {
              console.error('OpenAI Enhanced: Error fetching from Plaid directly:', plaidError);
            }
          }
        }
        
        console.log('OpenAI Enhanced: Final count -', accounts.length, 'accounts,', transactions.length, 'transactions, and investment data:', investmentData ? 'available' : 'none', 'for user', userId);
      } else {
        console.log('OpenAI Enhanced: No userId provided, fetching all data (this should not happen for authenticated users)');
      }
    } catch (error) {
      console.error('OpenAI Enhanced: Error fetching user data:', error);
    }
  }

  // Anonymize data before sending to OpenAI (skip for demo mode)
  if (!isDemo) {
    // Use proper anonymization functions that maintain tokenization maps
    const accountSummary = anonymizeAccountData(accounts);
    const transactionSummary = anonymizeTransactionData(transactions);
    
    // Replace the accounts and transactions with anonymized versions for AI processing
    accounts = accounts.map(account => {
      const tokenizedName = tokenizeAccount(account.name, account.institution);
      return {
        ...account,
        name: tokenizedName,
        plaidAccountId: `plaid_${account.id.slice(-8)}`
      };
    });
    
    transactions = transactions.map(transaction => {
      const tokenizedName = transaction.name ? tokenizeMerchant(transaction.name) : 'Unknown';
      return {
        ...transaction,
        name: tokenizedName,
        merchantName: transaction.merchantName ? tokenizeMerchant(transaction.merchantName) : 'Unknown'
      };
    });
  }

  // Get enhanced market context from MarketNewsManager
  console.log('OpenAI Enhanced: Getting market news context for tier:', tier);
  let marketContextSummary = '';
  
  try {
    const { MarketNewsManager } = await import('./market-news/manager');
    const marketNewsManager = new MarketNewsManager();
    marketContextSummary = await marketNewsManager.getMarketContext(tier);
    console.log('OpenAI Enhanced: Market news context length:', marketContextSummary.length);
  } catch (error) {
    console.error('OpenAI Enhanced: Error getting market news context:', error);
    // Fallback to data orchestrator if market news manager fails
    try {
      marketContextSummary = await dataOrchestrator.getMarketContextSummary(tier, isDemo);
      console.log('OpenAI Enhanced: Fallback to data orchestrator market context length:', marketContextSummary.length);
    } catch (fallbackError) {
      console.error('OpenAI Enhanced: Fallback market context also failed:', fallbackError);
      marketContextSummary = '';
    }
  }

  // Get search context for real-time financial information
  let searchContext: string | undefined;
  if (tier === UserTier.STANDARD || tier === UserTier.PREMIUM) {
    try {
      // Enhance search query for better results
      let enhancedQuery = question;
      
      // Detect financial institutions and enhance search queries
      const financialInstitutions = [
        // Major Banks
        'wells fargo', 'chase', 'bank of america', 'citibank', 'us bank', 'pnc', 'capital one',
        'goldman sachs', 'morgan stanley', 'jpmorgan',
        
        // Regional Banks
        'bb&t', 'suntrust', 'regions bank', 'keybank', 'fifth third', 'huntington',
        'comerica', 'citizens bank', 'm&t bank', 'bmo harris',
        
        // Credit Unions
        'navy federal', 'penfed', 'alliant', 'state employees',
        
        // Fintech & Digital Banks
        'ally bank', 'marcus', 'sofi', 'chime', 'current', 'varo', 'upstart',
        'fidelity', 'vanguard', 'schwab', 'td ameritrade', 'robinhood',
        'betterment', 'wealthfront', 'acorns', 'stash'
      ];
      
      const rateRelatedTerms = [
        'mortgage rate', 'refinance', 'interest rate', 'apr', 'cd rate', 'savings rate',
        'credit card rate', 'loan rate', 'investment return', 'yield', 'unemployment rate',
        'inflation rate', 'fed rate', 'federal reserve rate', 'treasury rate'
      ];
      
      // Check if question mentions a specific financial institution
      const mentionedInstitution = financialInstitutions.find(institution => 
        question.toLowerCase().includes(institution)
      );
      
      // Check if question is about rates/returns
      const isRateQuestion = rateRelatedTerms.some(term => 
        question.toLowerCase().includes(term)
      );
      
      if (mentionedInstitution && isRateQuestion) {
        // Specific institution + rate question
        enhancedQuery = `${mentionedInstitution} current rates today 2025 ${question.split(' ').slice(-3).join(' ')}`;
      } else if (mentionedInstitution) {
        // Specific institution question
        enhancedQuery = `${mentionedInstitution} ${question} current information 2025`;
      } else if (isRateQuestion) {
        // General rate question
        enhancedQuery = `${question} current rates today 2025`;
      } else if (question.toLowerCase().includes('investment') || question.toLowerCase().includes('stock') || question.toLowerCase().includes('market')) {
        // Investment/market question
        enhancedQuery = `${question} current market data 2025`;
      } else if (question.toLowerCase().includes('savings') || question.toLowerCase().includes('budget') || question.toLowerCase().includes('spending')) {
        // Personal finance question
        enhancedQuery = `${question} financial advice current 2025`;
      }
      
      console.log('OpenAI Enhanced: Getting search context for question:', question);
      console.log('OpenAI Enhanced: Enhanced search query:', enhancedQuery);
      const searchResults = await dataOrchestrator.getSearchContext(enhancedQuery, tier, isDemo);
      
      if (searchResults && searchResults.results.length > 0) {
        searchContext = searchResults.summary;
        console.log('OpenAI Enhanced: Search context found with', searchResults.results.length, 'results');
      } else {
        console.log('OpenAI Enhanced: No search context found for question');
      }
    } catch (error) {
      console.error('OpenAI Enhanced: Error getting search context:', error);
    }
  }

  // Build tier-aware context using the new orchestrator
  console.log('OpenAI Enhanced: Building tier-aware context for tier:', tier);
  const tierContext = await dataOrchestrator.buildTierAwareContext(tier, accounts, transactions, isDemo);
  
  console.log('OpenAI Enhanced: Tier context built:', {
    tier: tierContext.tierInfo.currentTier,
    availableSources: tierContext.tierInfo.availableSources.length,
    unavailableSources: tierContext.tierInfo.unavailableSources.length,
    upgradeHints: tierContext.upgradeHints.length
  });

  // Create account summary
  const accountSummary = tierContext.accounts.map(account => {
    let balance;
    if (isDemo) {
      balance = account.balance;
    } else if (account.balance && account.balance.current) {
      // Plaid API structure
      balance = account.balance.current;
    } else if (account.currentBalance) {
      // Database structure
      balance = account.currentBalance;
    } else {
      balance = 0;
    }
    
    const subtype = isDemo ? account.type : (account.subtype || account.type);
    let summary = `- ${account.name} (${account.type}/${subtype}): $${balance?.toFixed(2) || '0.00'}`;
    
    // Add interest rate for loans in demo mode
    if (isDemo && account.type === 'loan' && (account as any).interestRate) {
      summary += ` (Rate: ${(account as any).interestRate}%)`;
    }
    
    // Add interest rate for credit cards in demo mode
    if (isDemo && account.type === 'credit' && (account as any).interestRate) {
      summary += ` (APR: ${(account as any).interestRate}%)`;
    }
    
    // Add interest rate for savings/CDs in demo mode
    if (isDemo && (account.type === 'savings') && (account as any).interestRate) {
      summary += ` (Rate: ${(account as any).interestRate}%)`;
    }
    
    return summary;
  }).join('\n');

  // Create transaction summary
  // ✅ DEBUG: Log transaction data structure before building summary
  console.log('OpenAI Enhanced: DEBUG - Sample transaction data before building summary:', {
    totalTransactions: tierContext.transactions.length,
    firstTransaction: tierContext.transactions[0] ? {
      id: tierContext.transactions[0].id,
      name: tierContext.transactions[0].name,
      category: tierContext.transactions[0].category,
      categoryType: typeof tierContext.transactions[0].category,
      isArray: Array.isArray(tierContext.transactions[0].category),
      enriched_data: tierContext.transactions[0].enriched_data ? {
        category: tierContext.transactions[0].enriched_data.category,
        categoryType: typeof tierContext.transactions[0].enriched_data.category,
        isArray: Array.isArray(tierContext.transactions[0].enriched_data.category)
      } : 'No enriched data'
    } : 'No transactions'
  });
  
  const transactionSummary = tierContext.transactions.map(transaction => {
    const name = isDemo ? transaction.description : transaction.name;
    
    // ✅ PRIORITIZE enriched data over basic data for better categorization
    let category = 'Unknown';
    
    // First try enriched data
    if (transaction.enriched_data?.category && Array.isArray(transaction.enriched_data.category)) {
      const validEnrichedCategory = transaction.enriched_data.category.find((cat: any) => cat && cat.trim() !== '' && cat !== '0');
      if (validEnrichedCategory) {
        category = validEnrichedCategory;
      }
    }
    
    // Fallback to basic category if no enriched data
    if (category === 'Unknown' && transaction.category) {
      if (Array.isArray(transaction.category)) {
        const validBasicCategory = transaction.category.find((cat: any) => cat && cat.trim() !== '' && cat !== '0');
        if (validBasicCategory) {
          category = validBasicCategory;
        }
      } else if (typeof transaction.category === 'string' && transaction.category.trim() !== '') {
        category = transaction.category;
      }
    }
    
    // ✅ Use enhanced merchant name when available
    const merchantName = transaction.enriched_data?.merchant_name || 
                         transaction.merchant_name || 
                         name;
    
    // Fix: Invert the transaction amount sign to match expected behavior
    // Positive amounts should be negative (money leaving account) and vice versa
    const correctedAmount = -(transaction.amount || 0);
    
    // ✅ Include enhanced information when available
    let enhancedInfo = '';
    if (transaction.enriched_data) {
      if (transaction.enriched_data.website) {
        enhancedInfo += ` [Website: ${transaction.enriched_data.website}]`;
      }
      if (transaction.enriched_data.category && transaction.enriched_data.category.length > 1) {
        enhancedInfo += ` [Categories: ${transaction.enriched_data.category.filter((cat: any) => cat && cat.trim() !== '').join(', ')}]`;
      }
      if (transaction.enriched_data.brand_name && transaction.enriched_data.brand_name !== merchantName) {
        enhancedInfo += ` [Brand: ${transaction.enriched_data.brand_name}]`;
      }
    }
    
    return `- ${merchantName} (${category}): $${correctedAmount?.toFixed(2) || '0.00'} on ${transaction.date}${enhancedInfo}`;
  }).join('\n');

  // ✅ DEBUG: Log the final transaction summary to see what the AI receives
  console.log('OpenAI Enhanced: DEBUG - Final transaction summary preview:', {
    totalLength: transactionSummary.length,
    preview: transactionSummary.substring(0, 500),
    firstFewLines: transactionSummary.split('\n').slice(0, 3)
  });

  // Create investment summary
  let investmentSummary = '';
  if (investmentData) {
    const { portfolio, holdings } = investmentData;
    
    // Portfolio overview (keep totals but anonymize individual holdings)
    investmentSummary += `Portfolio Overview:
- Total Value: $${portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Number of Holdings: ${portfolio.holdingCount}
- Number of Securities: ${portfolio.securityCount}

Asset Allocation:
${portfolio.assetAllocation.map((allocation: any) => 
  `- ${allocation.type}: $${allocation.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${allocation.percentage.toFixed(1)}%)`
).join('\n')}

Top Holdings:
${anonymizeInvestmentData(holdings.slice(0, 10))}`;
  }

  console.log('OpenAI Enhanced: Account summary for AI:', accountSummary);
  console.log('OpenAI Enhanced: Transaction summary for AI:', transactionSummary);
  console.log('OpenAI Enhanced: Investment summary for AI:', investmentSummary ? 'available' : 'none');
  console.log('OpenAI Enhanced: Number of accounts found:', tierContext.accounts.length);
  console.log('OpenAI Enhanced: Number of transactions found:', tierContext.transactions.length);
  console.log('OpenAI Enhanced: Investment data available:', investmentData ? 'yes' : 'no');
  console.log('OpenAI Enhanced: User ID being used:', userId);
  
  // ✅ Debug: Log enhanced transaction data availability
  const enhancedTransactionsCount = tierContext.transactions.filter((t: any) => t.enriched_data).length;
  const totalTransactionsCount = tierContext.transactions.length;
  console.log(`OpenAI Enhanced: Enhanced data available for ${enhancedTransactionsCount}/${totalTransactionsCount} transactions`);
  
  if (enhancedTransactionsCount > 0) {
    console.log('OpenAI Enhanced: Sample enhanced transaction data:', {
      first: tierContext.transactions.find((t: any) => t.enriched_data)?.enriched_data,
      count: enhancedTransactionsCount
    });
  }

  // Get conversation history
  console.log('OpenAI Enhanced: Conversation history length:', conversationHistory.length);
  if (conversationHistory.length > 0) {
    console.log('OpenAI Enhanced: Recent conversation questions:', conversationHistory.slice(0, 3).map(c => c.question));
  }

  // For demo mode, use demo data
  if (isDemo) {
    console.log('OpenAI Enhanced: Demo accounts:', tierContext.accounts.length);
    console.log('OpenAI Enhanced: Demo transactions:', tierContext.transactions.length);
    console.log('OpenAI Enhanced: Demo investments:', investmentData ? 'available' : 'none');
    console.log('OpenAI Enhanced: Account summary preview:', accountSummary.substring(0, 500));
    console.log('OpenAI Enhanced: Transaction summary preview:', transactionSummary.substring(0, 500));
    console.log('OpenAI Enhanced: Investment summary preview:', investmentSummary ? investmentSummary.substring(0, 500) : 'none');
    console.log('OpenAI Enhanced: Full account summary:', accountSummary);
    console.log('OpenAI Enhanced: Full transaction summary:', transactionSummary);
    console.log('OpenAI Enhanced: Full investment summary:', investmentSummary);
  }

  // Get user profile if available
  let userProfile: string = '';
  if (isDemo && demoProfile) {
    // Use provided demo profile (already anonymized)
    userProfile = demoProfile;
    console.log('OpenAI Enhanced: Using provided demo profile, length:', userProfile.length);
  } else if (userId && !isDemo) {
    try {
      const { ProfileManager } = await import('./profile/manager');
      const profileManager = new ProfileManager(userId); // Use userId as sessionId
      userProfile = await profileManager.getOrCreateProfile(userId);
      console.log('OpenAI Enhanced: User profile retrieved and anonymized, length:', userProfile.length);
      
      // Enhance profile with Plaid data if available (for AI context only - don't overwrite original profile)
      if (accounts.length > 0 || transactions.length > 0) {
        try {
          const { PlaidProfileEnhancer } = await import('./profile/plaid-enhancer');
          const plaidEnhancer = new PlaidProfileEnhancer();
          const enhancedProfile = await plaidEnhancer.enhanceProfileFromPlaidData(
            userId,
            accounts,
            transactions,
            userProfile
          );
          
          if (enhancedProfile !== userProfile) {
            // Use enhanced profile for AI context but DON'T overwrite the original profile
            // The original profile should only be updated through updateProfileFromConversation
            userProfile = enhancedProfile;
            console.log('OpenAI Enhanced: User profile enhanced with Plaid data for AI context');
          }
        } catch (error) {
          console.error('OpenAI Enhanced: Failed to enhance profile with Plaid data:', error);
          // Don't fail the main request if Plaid enhancement fails
        }
      }
      
      // ✅ NEW: Fetch liabilities data for credit accounts
      let liabilitiesData = '';
      try {
        const accessTokens = await prisma.accessToken.findMany({
          where: { userId }
        });
        
        if (accessTokens.length > 0) {
          // Use the first token to get liabilities
          const token = accessTokens[0].token;
          const liabilitiesResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/plaid/liabilities`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (liabilitiesResponse.ok) {
            const liabilitiesData = await liabilitiesResponse.json();
            console.log('OpenAI Enhanced: Fetched liabilities data:', liabilitiesData);
            
            // Add liabilities context to user profile
            if (liabilitiesData.liabilities && liabilitiesData.liabilities.length > 0) {
              // Extract all liability accounts for anonymization
              const allLiabilityAccounts: any[] = [];
              liabilitiesData.liabilities.forEach((liability: any) => {
                if (liability.accounts && liability.accounts.length > 0) {
                  allLiabilityAccounts.push(...liability.accounts);
                }
              });
              
              if (allLiabilityAccounts.length > 0) {
                // Anonymize liability data before adding to profile
                const anonymizedLiabilities = anonymizeLiabilityData(allLiabilityAccounts);
                userProfile += `\n\nLIABILITIES INFORMATION:\n${anonymizedLiabilities}`;
                console.log('OpenAI Enhanced: Added anonymized liabilities context to profile');
              }
            }
          } else {
            // ✅ FIXED: Handle API failures gracefully
            console.log('OpenAI Enhanced: Liabilities API failed, status:', liabilitiesResponse.status);
            userProfile += `\n\nLIABILITIES INFORMATION:\nCredit limit information not available - your bank does not provide this data through Plaid.`;
            console.log('OpenAI Enhanced: Added fallback message for unavailable liabilities data');
          }
        }
      } catch (liabilitiesError) {
        console.error('OpenAI Enhanced: Error fetching liabilities:', liabilitiesError);
        // ✅ FIXED: Add fallback message when liabilities fetch fails
        userProfile += `\n\nLIABILITIES INFORMATION:\nCredit limit information not available - unable to fetch from your bank.`;
        console.log('OpenAI Enhanced: Added fallback message due to liabilities fetch error');
      }
    } catch (error) {
      console.error('OpenAI Enhanced: Failed to get user profile:', error);
      // Don't fail the main request if profile retrieval fails
    }
  }

  // Build enhanced system prompt with proactive market context
  const systemPrompt = buildEnhancedSystemPrompt(tierContext, accountSummary, transactionSummary, marketContextSummary, searchContext, userProfile, investmentSummary);

  console.log('OpenAI Enhanced: System prompt length:', systemPrompt.length);
  console.log('OpenAI Enhanced: System prompt preview:', systemPrompt.substring(0, 500));

  // Prepare conversation history for OpenAI
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Enhanced conversation history processing with context analysis
  const recentHistory = conversationHistory.slice(-10);
  
  // Analyze conversation history for context building opportunities
  const contextAnalysis = analyzeConversationContext(recentHistory, question);
  
  console.log('OpenAI Enhanced: Conversation context analysis:', {
    hasOpportunities: contextAnalysis.hasContextOpportunities,
    instruction: contextAnalysis.instruction,
    historyLength: recentHistory.length
  });
  
  // Add context-aware instruction if there are opportunities to build on previous conversations
  if (contextAnalysis.hasContextOpportunities) {
    const contextInstruction = `CONTEXT BUILDING OPPORTUNITY: ${contextAnalysis.instruction}`;
    messages.push({ role: 'user', content: contextInstruction });
    console.log('OpenAI Enhanced: Added context building instruction:', contextInstruction);
  }
  
  // Add conversation history with enhanced context
  for (const conv of recentHistory) {
    messages.push({ role: 'user', content: conv.question });
    messages.push({ role: 'assistant', content: conv.answer });
  }

  // Add current question
  messages.push({ role: 'user', content: question });

  console.log('OpenAI Enhanced: Sending request to OpenAI with', messages.length, 'messages');
  console.log('OpenAI Enhanced: Using model:', model || 'gpt-4o');

  try {
    const completion = await openai.chat.completions.create({
      model: model || 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    let answer = completion.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response.';

    console.log('🔧 TEST: Got OpenAI response, length:', answer.length);
    console.log('🔧 PREPROCESSING: Starting response formatting fix...');
    console.log('🔧 PREPROCESSING: Original answer length:', answer.length);
    console.log('🔧 PREPROCESSING: Original answer preview:', answer.substring(0, 200));
    
          try {
        // Fix list formatting issues
        answer = formatResponseWithRegex(answer);
        console.log('🔧 PREPROCESSING: Response formatting fix completed');
      } catch (error) {
        console.error('🔧 PREPROCESSING: Error in formatResponseWithRegex:', error);
      }

    // Enhance response with upgrade suggestions
    answer = enhanceResponseWithUpgrades(answer, tierContext, searchContext);

    console.log('OpenAI Enhanced: Response generated successfully');
    
    // Update user profile from conversation BEFORE generating response (for authenticated users only)
    if (userId && !isDemo) {
      try {
        const { ProfileManager } = await import('./profile/manager');
        const profileManager = new ProfileManager();
        
        // Extract profile information from the user's question BEFORE AI response
        await profileManager.updateProfileFromConversation(userId, {
          id: 'temp',
          question,
          answer: '', // No answer yet - we're extracting from the question
          createdAt: new Date()
        });
        console.log('OpenAI Enhanced: User profile updated from conversation question');
      } catch (error) {
        console.error('OpenAI Enhanced: Failed to update user profile:', error);
        // Don't fail the main request if profile update fails
      }
    }
    
    return answer;
  } catch (error) {
    console.error('OpenAI Enhanced: Error calling OpenAI API:', error);
    throw new Error('Failed to get AI response');
  }
}

/**
 * Analyzes conversation history to identify context building opportunities
 */
export function analyzeConversationContext(conversationHistory: Conversation[], currentQuestion: string): {
  hasContextOpportunities: boolean;
  instruction: string;
} {
  if (conversationHistory.length === 0) {
    return { hasContextOpportunities: false, instruction: '' };
  }

  const contextOpportunities: string[] = [];
  
  // Look for incomplete portfolio analysis requests
  const portfolioQuestions = conversationHistory.filter(conv => 
    conv.question.toLowerCase().includes('portfolio') || 
    conv.question.toLowerCase().includes('investment') ||
    conv.question.toLowerCase().includes('asset allocation')
  );
  
  if (portfolioQuestions.length > 0) {
    // Check if current question provides age or other key information
    const ageInfo = currentQuestion.match(/\b(\d+)\s*(?:years?\s*old|y\.?o\.?|age)\b/i);
    const incomeInfo = currentQuestion.match(/\b(?:income|salary|earn|make)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/i);
    const goalInfo = currentQuestion.match(/\b(?:goal|target|planning for|saving for)\b/i);
    
    if (ageInfo || incomeInfo || goalInfo) {
      contextOpportunities.push('User previously asked about portfolio analysis and now provided key personal information. Offer to complete the portfolio analysis with this new context.');
    }
  }
  
  // Look for incomplete financial planning requests
  const planningQuestions = conversationHistory.filter(conv => 
    conv.question.toLowerCase().includes('plan') || 
    conv.question.toLowerCase().includes('goal') ||
    conv.question.toLowerCase().includes('retirement') ||
    conv.question.toLowerCase().includes('savings')
  );
  
  if (planningQuestions.length > 0) {
    const ageInfo = currentQuestion.match(/\b(\d+)\s*(?:years?\s*old|y\.?o\.?|age)\b/i);
    const timelineInfo = currentQuestion.match(/\b(?:in\s+(\d+)\s+years?|(\d+)\s+years?\s+from\s+now)\b/i);
    
    if (ageInfo || timelineInfo) {
      contextOpportunities.push('User previously asked about financial planning and now provided timeline or age information. Offer to create a comprehensive financial plan.');
    }
  }
  
  // Look for incomplete debt analysis requests
  const debtQuestions = conversationHistory.filter(conv => 
    conv.question.toLowerCase().includes('debt') || 
    conv.question.toLowerCase().includes('credit') ||
    conv.question.toLowerCase().includes('loan')
  );
  
  if (debtQuestions.length > 0) {
    const incomeInfo = currentQuestion.match(/\b(?:income|salary|earn|make)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/i);
    const expenseInfo = currentQuestion.match(/\b(?:expense|spend|cost)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/i);
    
    if (incomeInfo || expenseInfo) {
      contextOpportunities.push('User previously asked about debt analysis and now provided income/expense information. Offer to complete the debt-to-income analysis.');
    }
  }
  
  // Look for incomplete budgeting requests
  const budgetQuestions = conversationHistory.filter(conv => 
    conv.question.toLowerCase().includes('budget') || 
    conv.question.toLowerCase().includes('spending') ||
    conv.question.toLowerCase().includes('expense')
  );
  
  if (budgetQuestions.length > 0) {
    const incomeInfo = currentQuestion.match(/\b(?:income|salary|earn|make)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/i);
    const familyInfo = currentQuestion.match(/\b(?:family|children|kids|dependents?)\b/i);
    
    if (incomeInfo || familyInfo) {
      contextOpportunities.push('User previously asked about budgeting and now provided income or family information. Offer to create a comprehensive budget plan.');
    }
  }
  
  if (contextOpportunities.length > 0) {
    return {
      hasContextOpportunities: true,
      instruction: contextOpportunities.join(' ')
    };
  }
  
  return { hasContextOpportunities: false, instruction: '' };
}

/**
 * Enhanced system prompt builder with proactive market context
 */
function buildEnhancedSystemPrompt(
  tierContext: TierAwareContext, 
  accountSummary: string, 
  transactionSummary: string,
  marketContextSummary: string,
  searchContext?: string,
  userProfile?: string,
  investmentSummary?: string
): string {
  const { tierInfo, upgradeHints } = tierContext;

  let systemPrompt = '';

  // Add search context at the very top with clear delimiters if available
  if (searchContext) {
    systemPrompt += `=== REAL-TIME FINANCIAL DATA ===
${searchContext}
=== END REAL-TIME FINANCIAL DATA ===

CRITICAL INSTRUCTIONS:
- You MUST use the information between the === REAL-TIME FINANCIAL DATA === markers to answer the user's question
- Do NOT say you lack access to real-time data when the answer is present above
- When the user asks about rates, prices, or current information, use the specific data from the search results above
- Provide the current information from the search results directly
- If the search results contain the answer, use that information instead of your training data

`;
  }

  systemPrompt += `You are Linc, an AI-powered financial analyst. You help users understand their finances by analyzing their account data and providing clear, actionable insights.

IMPORTANT: You have access to the user's financial data and current market conditions based on their subscription tier. Use this data to provide personalized, accurate financial advice.

CRITICAL CONVERSATION CONTEXT INSTRUCTIONS:
- You MUST analyze the conversation history to build context across multiple turns
- When a user provides new information (age, income, goals, etc.), immediately connect it to previous questions
- If a previous question was incomplete due to missing information, proactively offer to complete the analysis
- Build comprehensive insights by combining information from multiple conversation turns
- Be proactive about suggesting enhanced analysis when you now have sufficient information
- Example: If user asked about portfolio analysis earlier and now provides their age, immediately offer a complete age-appropriate portfolio analysis
- Always reference relevant previous conversation context when providing new insights
- Use accumulated information to provide more personalized and complete financial advice
- When you see "CONTEXT BUILDING OPPORTUNITY" instructions, prioritize addressing those opportunities
- Proactively offer to complete previous incomplete analyses when you now have sufficient information
- Reference specific details from previous conversations to show you're building on context
- Use phrases like "Based on your previous question about..." or "Now that I know your age is..." to show context awareness
- Always ask if the user would like you to complete or enhance previous analyses with the new information they've provided

${userProfile && userProfile.trim() ? `USER PROFILE:
${userProfile}

Use this profile information to provide more personalized and relevant financial advice.
Consider the user's personal situation, family status, occupation, and financial goals when making recommendations.

IMPORTANT: If the profile contains information about credit cards being "maxed out" or credit limits that seem incorrect, IGNORE that information and only use verified data from the current financial data section below.

` : ''}

USER'S FINANCIAL DATA:
Accounts:
${accountSummary || 'No accounts found'}

Recent Transactions:
${transactionSummary || 'No transactions found'}

${investmentSummary ? `INVESTMENT DATA:
${investmentSummary}` : 'No investment data available (upgrade to Standard tier)'}

CRITICAL DATA INTERPRETATION RULES:
- For credit card accounts: The "balance" field shows the OUTSTANDING BALANCE (money owed), NOT the credit limit
- For credit card accounts: The "limit" field (if available) shows the CREDIT LIMIT (maximum spending allowed)
- For checking/savings accounts: The "balance" field shows the AVAILABLE BALANCE (money you have)
- When analyzing debt: Use the outstanding balance amount, not the account balance field
- If liabilities data is available in the user profile, use that for credit limits and debt analysis
- IMPORTANT: If credit limit information is not available, DO NOT assume the balance equals the credit limit
- IMPORTANT: When credit limits are unknown, clearly state "Credit Limit: Unknown" and do not make assumptions about card utilization
- CRITICAL: NEVER say a credit card is "maxed out" unless you have explicit credit limit data showing the balance equals the limit
- CRITICAL: NEVER infer credit utilization percentages without knowing the actual credit limit
- CRITICAL: If you see "maxed out" or similar language in previous conversations, IGNORE it and only use current, verified data

USER TIER: ${String(tierInfo.currentTier).toUpperCase()}

AVAILABLE DATA SOURCES:
${tierInfo.availableSources.length > 0 ? tierInfo.availableSources.map(source => `• ${source}`).join('\n') : '• Account data only'}

${tierInfo.unavailableSources.length > 0 ? `UNAVAILABLE DATA SOURCES (upgrade to access):
${tierInfo.unavailableSources.map(source => `• ${source}`).join('\n')}` : ''}

${marketContextSummary ? `ENHANCED MARKET CONTEXT:
${marketContextSummary}` : 'No market context available (upgrade to Standard tier)'}

${searchContext ? `ADDITIONAL REAL-TIME INFORMATION:
The search results above contain current financial data. When the user asks about rates, prices, or current information, use the specific data from the search results above. Do NOT say you don't have access to this information when it is provided in the search results.

When providing financial advice, be specific about:
- Current rates, prices, or market conditions relevant to the question
- Comparison with user's current financial situation when applicable
- Specific next steps or actions the user can take
- Any special programs, discounts, or opportunities mentioned in the search results
- Time-sensitive information or market trends that affect the advice

For rate comparisons (mortgage, credit card, savings, etc.):
- Compare user's current rate vs. market averages when available
- Assess whether refinancing/switching makes financial sense
- Consider fees, closing costs, and other factors
- Recommend specific institutions or products when relevant

For investment questions:
- Use current market data and trends
- Consider user's risk tolerance and financial goals
- Reference specific investment vehicles or strategies mentioned

For personal finance questions:
- Provide actionable budgeting or savings advice
- Reference current financial products or services
- Consider user's income, expenses, and financial situation` : ''}

${!searchContext ? `TIER LIMITATIONS:
${tierInfo.limitations.map(limitation => `• ${limitation}`).join('\n')}` : ''}

INSTRUCTIONS:
- Provide clear, actionable financial advice based on available data
- Use specific numbers from the user's data when possible
- Reference current market conditions when relevant and available
- Use real-time financial information when available to provide the most current advice
- ALWAYS reference relevant previous conversation context when providing new insights
- When new information allows you to complete a previous incomplete analysis, proactively offer to do so
- Build comprehensive insights by connecting information across conversation turns

RESPONSE FORMATTING:
- Use bullet points (- ) for lists, keeping bullet and text on same line
- Use numbered lists (1. 2. 3.) for steps or rankings
- Use ## for section headers
- Keep paragraphs concise with single line breaks between them
- Format numbers and percentages clearly
- Make the response clean and professional
- Avoid excessive blank lines between list items
- Be conversational but professional
- If you don't have enough data, ask for more information
- Always provide source attribution when using external data
- Focus on the user's specific financial situation and goals
- Use the enhanced market context to provide more informed recommendations
- When using search results, prioritize the most recent and relevant information

CALCULATION AND MATHEMATICAL FORMATTING:
- For financial calculations, use clear step-by-step breakdowns with numbered steps
- Display mathematical formulas in \`code blocks\` for clarity
- Use **bold** for final calculated values and key percentages
- Show intermediate calculation steps for complex ratios (e.g., "Step 1: Calculate monthly income", "Step 2: Sum monthly debt payments")
- Format currency values consistently: $X,XXX.XX
- Format percentages with 2 decimal places when appropriate (e.g., 15.67%)
- For ratios and percentages, show both the calculation and the result clearly
- Use structured formatting for multi-step calculations:
  \`\`\`
  Step 1: [Calculation description]
  Step 2: [Calculation description]
  Final Result: [Bold final value]
  \`\`\`
- Always verify calculations by showing the math: "Verification: $X ÷ $Y = Z%"
- For debt-to-income ratios, clearly separate numerator (debt) and denominator (income)
- Use bullet points to list individual debt components before summing
- Show both the raw calculation and the percentage result

VISUAL CALCULATION ENHANCEMENTS:
- Use "Step 1:", "Step 2:", etc. to trigger calculation block styling
- Include "Verification:" text to trigger verification block styling
- Use mathematical expressions with = signs and currency/percentage symbols to trigger math expression styling
- Structure debt-to-income calculations as:
  Step 1: Calculate monthly debt payments
  - Credit card balance: $X.XX
  - Other debts: $Y.YY
  Total monthly debt: $Z.ZZ
  
  Step 2: Calculate monthly income
  Annual income: $X,XXX.XX
  Monthly income: $X,XXX.XX ÷ 12 = $Y,YYY.YY
  
  Step 3: Calculate DTI ratio
  DTI = ($Z.ZZ ÷ $Y,YYY.YY) × 100 = X.XX%
  
  Final Result: Your DTI ratio is **X.XX%**
  
  Verification: $Z.ZZ ÷ $Y,YYY.YY = X.XX%

${!searchContext && tierInfo.unavailableSources.length > 0 ? `
- Be helpful with current tier limitations
- When relevant, mention upgrade benefits for unavailable features` : ''}`;

  return systemPrompt;
}

export async function askOpenAI(
  question: string, 
  conversationHistory: Conversation[] = [], 
  userTier: UserTier | string = UserTier.STARTER, 
  isDemo: boolean = false, 
  userId?: string,
  model?: string
): Promise<string> {
  // Convert string tier to enum if needed
  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;

  // Get user-specific data
  let accounts: any[] = [];
  let transactions: any[] = [];

  // For demo mode, use demo data instead of database data
  if (isDemo) {
    console.log('OpenAI: Using demo data for accounts and transactions');
    try {
      const { demoData } = await import('./demo-data');
      accounts = demoData.accounts || [];
      transactions = demoData.transactions || [];
      console.log('OpenAI: Demo data loaded - accounts:', accounts.length, 'transactions:', transactions.length);
    } catch (error) {
      console.error('OpenAI: Error loading demo data:', error);
    }
  } else {
    // For authenticated users, fetch from database first, then Plaid if needed
    try {
      if (userId) {
        console.log('OpenAI: Fetching user-specific data for userId:', userId);
        const { getPrismaClient } = await import('./prisma-client');
        const prisma = getPrismaClient();
        
        // First try to get data from database
        accounts = await prisma.account.findMany({
          where: { userId },
          include: { transactions: true }
        });
        
        transactions = await prisma.transaction.findMany({
          where: { account: { userId } },
          orderBy: { date: 'desc' },
          take: 50
        });
        
        // ✅ FIXED: Parse category strings back into arrays for database transactions
        transactions = transactions.map(transaction => ({
          ...transaction,
          // Parse category string back into array if it's stored as comma-separated string
          category: transaction.category ? 
            (typeof transaction.category === 'string' ? 
              transaction.category.split(',').map((cat: any) => cat.trim()).filter((cat: any) => cat && cat !== '') :
              transaction.category) : 
            []
        }));
        
        console.log('OpenAI Enhanced: Found', accounts.length, 'accounts and', transactions.length, 'transactions in database for user', userId);
        
        // If no data in database, try to fetch from Plaid directly
        if (accounts.length === 0 || transactions.length === 0) {
          console.log('OpenAI Enhanced: No data in database, fetching from Plaid directly');
          
          // CRITICAL SECURITY FIX: Never call Plaid APIs in demo mode
          if (isDemo) {
            console.log('OpenAI Enhanced: DEMO MODE - Skipping Plaid API calls for security');
          } else {
            try {
              // Import Plaid functions directly
              const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
              
              const credentials = getPlaidCredentials();
              const configuration = new Configuration({
                basePath: PlaidEnvironments[credentials.env],
                baseOptions: {
                  headers: {
                    'PLAID-CLIENT-ID': credentials.clientId,
                    'PLAID-SECRET': credentials.secret,
                  },
                },
              });
              
              const plaidClient = new PlaidApi(configuration);
              
              // Get access tokens for the current user only
              const accessTokens = await prisma.accessToken.findMany({
                where: { userId }
              });
              
              if (accessTokens.length > 0) {
                console.log('OpenAI Enhanced: Found', accessTokens.length, 'access tokens for user', userId);
                
                // Fetch accounts from all tokens
                for (const tokenRecord of accessTokens) {
                  try {
                    const accountsResponse = await plaidClient.accountsGet({
                      access_token: tokenRecord.token,
                    });
                    
                    const balancesResponse = await plaidClient.accountsBalanceGet({
                      access_token: tokenRecord.token,
                    });
                    
                    // Merge account and balance data
                    const accountsWithBalances = accountsResponse.data.accounts.map((account: any) => {
                      const balance = balancesResponse.data.accounts.find((b: any) => b.account_id === account.account_id);
                      return {
                        id: account.account_id,
                        name: account.name,
                        type: account.type,
                        subtype: account.subtype,
                        mask: account.mask,
                        balance: {
                          available: balance?.balances?.available || account.balances?.available,
                          current: balance?.balances?.current || account.balances?.current,
                          limit: balance?.balances?.limit || account.balances?.limit,
                        },
                        institution: account.institution_name,
                        officialName: account.official_name,
                        verificationStatus: account.verification_status,
                        currency: account.currency
                      };
                    });
                    
                    accounts.push(...accountsWithBalances);
                    console.log('OpenAI Enhanced: Fetched', accountsWithBalances.length, 'accounts from Plaid');
                  } catch (error) {
                    console.error('OpenAI Enhanced: Error fetching accounts from token:', error);
                  }
                }
                
                // Fetch transactions from all tokens
                const endDate = new Date().toISOString().split('T')[0];
                const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                
                for (const tokenRecord of accessTokens) {
                  try {
                    // Use the enhanced transactions endpoint instead of calling Plaid directly
                    const enhancedTransactionsResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/plaid/transactions`, {
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${tokenRecord.token}`,
                        'Content-Type': 'application/json'
                      }
                    });
                    
                    if (enhancedTransactionsResponse.ok) {
                      const enhancedTransactionsData = await enhancedTransactionsResponse.json();
                      const enhancedTransactions = enhancedTransactionsData.transactions || [];
                      
                      // Process enhanced transactions (they already include enriched_data)
                      const processedTransactions = enhancedTransactions.map((transaction: any) => ({
                        id: transaction.id || transaction.transaction_id,
                        account_id: transaction.account_id,
                        amount: transaction.amount,
                        date: transaction.date,
                        name: transaction.name,
                        merchant_name: transaction.merchant_name,
                        category: transaction.category,
                        category_id: transaction.category_id,
                        pending: transaction.pending,
                        payment_channel: transaction.payment_channel,
                        location: transaction.location,
                        payment_meta: transaction.payment_meta,
                        pending_transaction_id: transaction.pending_transaction_id,
                        account_owner: transaction.account_owner,
                        transaction_code: transaction.transaction_code,
                        enriched_data: transaction.enriched_data // Include enhanced data
                      }));
                      
                      transactions.push(...processedTransactions);
                      console.log('OpenAI Enhanced: Fetched', processedTransactions.length, 'enhanced transactions from enhanced endpoint');
                      
                      // Log enhanced data availability
                      const enhancedCount = processedTransactions.filter((t: any) => t.enriched_data).length;
                      console.log(`OpenAI Enhanced: Enhanced data available for ${enhancedCount}/${processedTransactions.length} transactions`);
                    } else {
                      console.warn('OpenAI Enhanced: Enhanced transactions endpoint failed, falling back to basic Plaid call');
                      
                      // Fallback to basic Plaid call if enhanced endpoint fails
                      const transactionsResponse = await plaidClient.transactionsGet({
                        access_token: tokenRecord.token,
                        start_date: startDate,
                        end_date: endDate,
                        options: {
                          count: 50,
                          include_personal_finance_category: true
                        }
                      });
                      
                      const processedTransactions = transactionsResponse.data.transactions.map((transaction: any) => ({
                        id: transaction.transaction_id,
                        account_id: transaction.account_id,
                        amount: transaction.amount,
                        date: transaction.date,
                        name: transaction.name,
                        merchant_name: transaction.merchant_name,
                        category: transaction.category,
                        category_id: transaction.category_id,
                        pending: transaction.pending,
                        payment_channel: transaction.payment_channel,
                        location: transaction.location,
                        payment_meta: transaction.payment_meta,
                        pending_transaction_id: transaction.pending_transaction_id,
                        account_owner: transaction.account_owner,
                        transaction_code: transaction.transaction_code
                      }));
                      
                      transactions.push(...processedTransactions);
                      console.log('OpenAI Enhanced: Fetched', processedTransactions.length, 'basic transactions from Plaid (fallback)');
                    }
                  } catch (error) {
                    console.error('OpenAI Enhanced: Error fetching transactions:', error);
                  }
                }
              }
            } catch (plaidError) {
              console.error('OpenAI Enhanced: Error fetching from Plaid directly:', plaidError);
            }
          }
        }
        
        console.log('OpenAI Enhanced: Final count -', accounts.length, 'accounts and', transactions.length, 'transactions for user', userId);
      } else {
        console.log('OpenAI Enhanced: No userId provided, fetching all data (this should not happen for authenticated users)');
      }
    } catch (error) {
      console.error('OpenAI Enhanced: Error fetching user data:', error);
    }
  }

  // Create dual data structures: real data for display, tokenized data for AI
  let displayAccounts = [...accounts];
  let displayTransactions = [...transactions];
  let aiAccounts = [...accounts];
  let aiTransactions = [...transactions];

  // Tokenize data for AI processing (skip for demo mode since it uses fake data)
  if (!isDemo) {
    aiAccounts = accounts.map(account => ({
      ...account,
      name: `Account_${account.id.slice(-4)}`,
      plaidAccountId: `plaid_${account.id.slice(-8)}`
    }));
    
    aiTransactions = transactions.map(transaction => ({
      ...transaction,
      name: transaction.name ? `Transaction_${transaction.id.slice(-4)}` : 'Unknown',
      merchantName: transaction.merchantName ? `Merchant_${transaction.id.slice(-4)}` : 'Unknown',
      // ✅ Anonymize enriched data if available
      enriched_data: transaction.enriched_data ? {
        ...transaction.enriched_data,
        merchant_name: transaction.enriched_data.merchant_name ? 
          tokenizeMerchant(transaction.enriched_data.merchant_name) : 'Unknown',
        category: transaction.enriched_data.category?.map((cat: any) => 
          cat && cat.trim() !== '' ? tokenizeMerchant(cat) : 'Unknown'
        ) || [],
        website: transaction.enriched_data.website ? 
          `website_${transaction.enriched_data.website.split('.').slice(-2).join('_')}` : undefined,
        brand_name: transaction.enriched_data.brand_name ? 
          tokenizeMerchant(transaction.enriched_data.brand_name) : 'Unknown'
      } : undefined
    }));
  }

  // Build tier-aware context using AI data (tokenized for production, real for demo)
  console.log('OpenAI: Building tier-aware context for tier:', tier, 'isDemo:', isDemo);
  const tierContext = await dataOrchestrator.buildTierAwareContext(tier, aiAccounts, aiTransactions, isDemo);
  
  console.log('OpenAI: Tier context built:', {
    tier: tierContext.tierInfo.currentTier,
    availableSources: tierContext.tierInfo.availableSources.length,
    unavailableSources: tierContext.tierInfo.unavailableSources.length,
    upgradeHints: tierContext.upgradeHints.length
  });

  // Get search context for real-time financial information
  let searchContext: string | undefined;
  if (tier === UserTier.STANDARD || tier === UserTier.PREMIUM) {
    try {
      console.log('OpenAI: Getting search context for question:', question);
      const searchResults = await dataOrchestrator.getSearchContext(question, tier, isDemo);
      
      if (searchResults && searchResults.results.length > 0) {
        searchContext = searchResults.summary;
        console.log('OpenAI: Search context found with', searchResults.results.length, 'results');
        console.log('OpenAI: Search context preview:', searchContext.substring(0, 200) + '...');
      } else {
        console.log('OpenAI: No search context found for question');
      }
    } catch (error) {
      console.error('OpenAI: Error getting search context:', error);
    }
  }

  // Create account summary using display data (real names for user)
  const accountSummary = displayAccounts.map(account => {
    let balance;
    if (isDemo) {
      balance = account.balance;
    } else if (account.balance && account.balance.current) {
      // Plaid API structure
      balance = account.balance.current;
    } else if (account.currentBalance) {
      // Database structure
      balance = account.currentBalance;
    } else {
      balance = 0;
    }
    
    const subtype = isDemo ? account.type : (account.subtype || account.type);
    return `- ${account.name} (${account.type}/${subtype}): $${balance?.toFixed(2) || '0.00'}`;
  }).join('\n');

  // Create transaction summary using display data (real names for user)
  const transactionSummary = displayTransactions.map(transaction => {
    const name = isDemo ? transaction.description : transaction.name;
    
    // ✅ PRIORITIZE enriched data over basic data for better categorization
    let category = 'Unknown';
    
    // First try enriched data
    if (transaction.enriched_data?.category && Array.isArray(transaction.enriched_data.category)) {
      const validEnrichedCategory = transaction.enriched_data.category.find((cat: any) => cat && cat.trim() !== '' && cat !== '0');
      if (validEnrichedCategory) {
        category = validEnrichedCategory;
      }
    }
    
    // Fallback to basic category if no enriched data
    if (category === 'Unknown' && transaction.category) {
      if (Array.isArray(transaction.category)) {
        const validBasicCategory = transaction.category.find((cat: any) => cat && cat.trim() !== '' && cat !== '0');
        if (validBasicCategory) {
          category = validBasicCategory;
        }
      } else if (typeof transaction.category === 'string' && transaction.category.trim() !== '') {
        category = transaction.category;
      }
    }
    
    // ✅ Use enhanced merchant name when available
    const merchantName = transaction.enriched_data?.merchant_name || 
                         transaction.merchant_name || 
                         name;
    
    // Fix: Invert the transaction amount sign to match expected behavior
    // Positive amounts should be negative (money leaving account) and vice versa
    const correctedAmount = -(transaction.amount || 0);
    
    // ✅ Include enhanced information when available
    let enhancedInfo = '';
    if (transaction.enriched_data) {
      if (transaction.enriched_data.website) {
        enhancedInfo += ` [Website: ${transaction.enriched_data.website}]`;
      }
      if (transaction.enriched_data.category && transaction.enriched_data.category.length > 1) {
        enhancedInfo += ` [Categories: ${transaction.enriched_data.category.filter((cat: any) => cat && cat.trim() !== '').join(', ')}]`;
      }
      if (transaction.enriched_data.brand_name && transaction.enriched_data.brand_name !== merchantName) {
        enhancedInfo += ` [Brand: ${transaction.enriched_data.brand_name}]`;
      }
    }
    
    return `- ${merchantName} (${category}): $${correctedAmount?.toFixed(2) || '0.00'} on ${transaction.date}${enhancedInfo}`;
  }).join('\n');

  console.log('OpenAI: Account summary for AI:', accountSummary);
  console.log('OpenAI: Transaction summary for AI:', transactionSummary);
  console.log('OpenAI: Number of accounts found:', tierContext.accounts.length);
  console.log('OpenAI: Number of transactions found:', tierContext.transactions.length);
  console.log('OpenAI: User ID being used:', userId);
  
  // ✅ Debug: Log enhanced transaction data availability
  const enhancedTransactionsCount = tierContext.transactions.filter((t: any) => t.enriched_data).length;
  const totalTransactionsCount = tierContext.transactions.length;
  console.log(`OpenAI Enhanced: Enhanced data available for ${enhancedTransactionsCount}/${totalTransactionsCount} transactions`);
  
  if (enhancedTransactionsCount > 0) {
    console.log('OpenAI Enhanced: Sample enhanced transaction data:', {
      first: tierContext.transactions.find((t: any) => t.enriched_data)?.enriched_data,
      count: enhancedTransactionsCount
    });
  }

  // Get conversation history
  console.log('OpenAI: Conversation history length:', conversationHistory.length);
  if (conversationHistory.length > 0) {
    console.log('OpenAI: Recent conversation questions:', conversationHistory.slice(0, 3).map(c => c.question));
  }

  // For demo mode, use demo data
  if (isDemo) {
    console.log('OpenAI: Demo accounts:', tierContext.accounts.length);
    console.log('OpenAI: Demo transactions:', tierContext.transactions.length);
    console.log('OpenAI: Account summary preview:', accountSummary.substring(0, 500));
    console.log('OpenAI: Transaction summary preview:', transactionSummary.substring(0, 500));
    console.log('OpenAI: Full account summary:', accountSummary);
    console.log('OpenAI: Full transaction summary:', transactionSummary);
  }

  // Get user profile if available
  let userProfile: string = '';
  if (userId && !isDemo) {
    try {
      const { ProfileManager } = await import('./profile/manager');
      const profileManager = new ProfileManager(userId); // Use userId as sessionId
      userProfile = await profileManager.getOrCreateProfile(userId);
      console.log('OpenAI: User profile retrieved and anonymized, length:', userProfile.length);
      
      // Enhance profile with Plaid data if available (for AI context only - don't overwrite original profile)
      if (accounts.length > 0 || transactions.length > 0) {
        try {
          const { PlaidProfileEnhancer } = await import('./profile/plaid-enhancer');
          const plaidEnhancer = new PlaidProfileEnhancer();
          const enhancedProfile = await plaidEnhancer.enhanceProfileFromPlaidData(
            userId,
            accounts,
            transactions,
            userProfile
          );
          
          if (enhancedProfile !== userProfile) {
            // Use enhanced profile for AI context but DON'T overwrite the original profile
            // The original profile should only be updated through updateProfileFromConversation
            userProfile = enhancedProfile;
            console.log('OpenAI: User profile enhanced with Plaid data for AI context');
          }
        } catch (error) {
          console.error('OpenAI: Failed to enhance profile with Plaid data:', error);
          // Don't fail the main request if Plaid enhancement fails
        }
      }
      
      // ✅ NEW: Fetch liabilities data for credit accounts
      let liabilitiesData = '';
      try {
        const accessTokens = await prisma.accessToken.findMany({
          where: { userId }
        });
        
        if (accessTokens.length > 0) {
          // Use the first token to get liabilities
          const token = accessTokens[0].token;
          const liabilitiesResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/plaid/liabilities`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (liabilitiesResponse.ok) {
            const liabilitiesData = await liabilitiesResponse.json();
            console.log('OpenAI Enhanced: Fetched liabilities data:', liabilitiesData);
            
            // Add liabilities context to user profile
            if (liabilitiesData.liabilities && liabilitiesData.liabilities.length > 0) {
              // Extract all liability accounts for anonymization
              const allLiabilityAccounts: any[] = [];
              liabilitiesData.liabilities.forEach((liability: any) => {
                if (liability.accounts && liability.accounts.length > 0) {
                  allLiabilityAccounts.push(...liability.accounts);
                }
              });
              
              if (allLiabilityAccounts.length > 0) {
                // Anonymize liability data before adding to profile
                const anonymizedLiabilities = anonymizeLiabilityData(allLiabilityAccounts);
                userProfile += `\n\nLIABILITIES INFORMATION:\n${anonymizedLiabilities}`;
                console.log('OpenAI Enhanced: Added anonymized liabilities context to profile');
              }
            }
          } else {
            // ✅ FIXED: Handle API failures gracefully
            console.log('OpenAI Enhanced: Liabilities API failed, status:', liabilitiesResponse.status);
            userProfile += `\n\nLIABILITIES INFORMATION:\nCredit limit information not available - your bank does not provide this data through Plaid.`;
            console.log('OpenAI Enhanced: Added fallback message for unavailable liabilities data');
          }
        }
      } catch (liabilitiesError) {
        console.error('OpenAI Enhanced: Error fetching liabilities:', liabilitiesError);
        // ✅ FIXED: Add fallback message when liabilities fetch fails
        userProfile += `\n\nLIABILITIES INFORMATION:\nCredit limit information not available - unable to fetch from your bank.`;
        console.log('OpenAI Enhanced: Added fallback message due to liabilities fetch error');
      }
    } catch (error) {
      console.error('OpenAI Enhanced: Failed to get user profile:', error);
      // Don't fail the main request if profile retrieval fails
    }
  }

  // Build enhanced system prompt with tier-aware context
  const systemPrompt = buildTierAwareSystemPrompt(tierContext, accountSummary, transactionSummary, searchContext, userProfile);

  console.log('OpenAI: System prompt length:', systemPrompt.length);
  console.log('OpenAI: System prompt preview:', systemPrompt.substring(0, 500));

  // Prepare conversation history for OpenAI
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Enhanced conversation history processing with context analysis
  const recentHistory = conversationHistory.slice(-10);
  
  // Analyze conversation history for context building opportunities
  const contextAnalysis = analyzeConversationContext(recentHistory, question);
  
  console.log('OpenAI Enhanced: Conversation context analysis:', {
    hasOpportunities: contextAnalysis.hasContextOpportunities,
    instruction: contextAnalysis.instruction,
    historyLength: recentHistory.length
  });
  
  // Add context-aware instruction if there are opportunities to build on previous conversations
  if (contextAnalysis.hasContextOpportunities) {
    const contextInstruction = `CONTEXT BUILDING OPPORTUNITY: ${contextAnalysis.instruction}`;
    messages.push({ role: 'user', content: contextInstruction });
    console.log('OpenAI Enhanced: Added context building instruction:', contextInstruction);
  }
  
  // Add conversation history with enhanced context
  for (const conv of recentHistory) {
    messages.push({ role: 'user', content: conv.question });
    messages.push({ role: 'assistant', content: conv.answer });
  }

  // Add current question
  messages.push({ role: 'user', content: question });

  console.log('OpenAI: Sending request to OpenAI with', messages.length, 'messages');
  console.log('OpenAI: Using model:', model || 'gpt-4o');

  try {
    const completion = await openai.chat.completions.create({
      model: model || 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    let answer = completion.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response.';

    console.log('🔧 TEST: Got OpenAI response, length:', answer.length);
    console.log('🔧 PREPROCESSING: Starting response formatting fix...');
    console.log('🔧 PREPROCESSING: Original answer length:', answer.length);
    console.log('🔧 PREPROCESSING: Original answer preview:', answer.substring(0, 200));
    
          try {
        // Fix list formatting issues
        answer = formatResponseWithRegex(answer);
        console.log('🔧 PREPROCESSING: Response formatting fix completed');
      } catch (error) {
        console.error('🔧 PREPROCESSING: Error in formatResponseWithRegex:', error);
      }

    // Enhance response with upgrade suggestions
    answer = enhanceResponseWithUpgrades(answer, tierContext, searchContext);

    console.log('OpenAI: Response generated successfully');
    
    // Update user profile from conversation BEFORE generating response (for authenticated users only)
    if (userId && !isDemo) {
      try {
        const { ProfileManager } = await import('./profile/manager');
        const profileManager = new ProfileManager();
        
        // Extract profile information from the user's question BEFORE AI response
        await profileManager.updateProfileFromConversation(userId, {
          id: 'temp',
          question,
          answer: '', // No answer yet - we're extracting from the question
          createdAt: new Date()
        });
        console.log('OpenAI: User profile updated from conversation question');
      } catch (error) {
        console.error('OpenAI: Failed to update user profile:', error);
        // Don't fail the main request if profile update fails
      }
    }
    
    return answer;
  } catch (error) {
    console.error('OpenAI: Error calling OpenAI API:', error);
    throw new Error('Failed to get AI response');
  }
}

function buildTierAwareSystemPrompt(
  tierContext: TierAwareContext, 
  accountSummary: string, 
  transactionSummary: string,
  searchContext?: string,
  userProfile?: string
): string {
  const { tierInfo, marketContext, upgradeHints } = tierContext;

  let systemPrompt = '';

  // Add search context at the very top with clear delimiters if available
  if (searchContext) {
    systemPrompt += `=== REAL-TIME FINANCIAL DATA ===
${searchContext}
=== END REAL-TIME FINANCIAL DATA ===

CRITICAL INSTRUCTIONS:
- You MUST use the information between the === REAL-TIME FINANCIAL DATA === markers to answer the user's question
- Do NOT say you lack access to real-time data when the answer is present above
- When the user asks about rates, prices, or current information, use the specific data from the search results above
- Provide the current information from the search results directly
- If the search results contain the answer, use that information instead of your training data

`;
  }

  systemPrompt += `You are Linc, an AI-powered financial analyst. You help users understand their finances by analyzing their account data and providing clear, actionable insights.

IMPORTANT: You have access to the user's financial data and current market conditions based on their subscription tier. Use this data to provide personalized, accurate financial advice.

CRITICAL CONVERSATION CONTEXT INSTRUCTIONS:
- You MUST analyze the conversation history to build context across multiple turns
- When a user provides new information (age, income, goals, etc.), immediately connect it to previous questions
- If a previous question was incomplete due to missing information, proactively offer to complete the analysis
- Build comprehensive insights by combining information from multiple conversation turns
- Be proactive about suggesting enhanced analysis when you now have sufficient information
- Example: If user asked about portfolio analysis earlier and now provides their age, immediately offer a complete age-appropriate portfolio analysis
- Always reference relevant previous conversation context when providing new insights
- Use accumulated information to provide more personalized and complete financial advice

${userProfile && userProfile.trim() ? `USER PROFILE:
${userProfile}

Use this profile information to provide more personalized and relevant financial advice.
Consider the user's personal situation, family status, occupation, and financial goals when making recommendations.

IMPORTANT: If the profile contains information about credit cards being "maxed out" or credit limits that seem incorrect, IGNORE that information and only use verified data from the current financial data section below.

` : ''}

USER'S FINANCIAL DATA:
Accounts:
${accountSummary || 'No accounts found'}

Recent Transactions:
${transactionSummary || 'No transactions found'}

CRITICAL DATA INTERPRETATION RULES:
- For credit card accounts: The "balance" field shows the OUTSTANDING BALANCE (money owed), NOT the credit limit
- For credit card accounts: The "limit" field (if available) shows the CREDIT LIMIT (maximum spending allowed)
- For checking/savings accounts: The "balance" field shows the AVAILABLE BALANCE (money you have)
- When analyzing debt: Use the outstanding balance amount, not the account balance field
- If liabilities data is available in the user profile, use that for credit limits and debt analysis
- IMPORTANT: If credit limit information is not available, DO NOT assume the balance equals the credit limit
- IMPORTANT: When credit limits are unknown, clearly state "Credit Limit: Unknown" and do not make assumptions about card utilization
- CRITICAL: NEVER say a credit card is "maxed out" unless you have explicit credit limit data showing the balance equals the limit
- CRITICAL: NEVER infer credit utilization percentages without knowing the actual credit limit
- CRITICAL: If you see "maxed out" or similar language in previous conversations, IGNORE it and only use current, verified data

USER TIER: ${String(tierInfo.currentTier).toUpperCase()}

AVAILABLE DATA SOURCES:
${tierInfo.availableSources.length > 0 ? tierInfo.availableSources.map(source => `• ${source}`).join('\n') : '• Account data only'}

${tierInfo.unavailableSources.length > 0 ? `UNAVAILABLE DATA SOURCES (upgrade to access):
${tierInfo.unavailableSources.map(source => `• ${source}`).join('\n')}` : ''}

MARKET CONTEXT:
${marketContext?.economicIndicators ? `Economic Indicators:
- CPI Index: ${marketContext.economicIndicators.cpi.value} (${marketContext.economicIndicators.cpi.date})
- Fed Funds Rate: ${marketContext.economicIndicators.fedRate.value}%
- Average 30-year Mortgage Rate: ${marketContext.economicIndicators.mortgageRate.value}%
- Average Credit Card APR: ${marketContext.economicIndicators.creditCardAPR.value}%` : 'No economic indicators available (upgrade to Standard tier)'}

${marketContext?.liveMarketData ? `Live Market Data:
CD Rates (APY): ${marketContext.liveMarketData.cdRates.map(cd => `${cd.term}: ${cd.rate}%`).join(', ')}
Treasury Yields: ${marketContext.liveMarketData.treasuryYields.slice(0, 4).map(t => `${t.term}: ${t.yield}%`).join(', ')}
Current Mortgage Rates: ${marketContext.liveMarketData.mortgageRates.map(m => `${m.type}: ${m.rate}%`).join(', ')}` : 'No live market data available (upgrade to Premium tier)'}

${searchContext ? `ADDITIONAL REAL-TIME INFORMATION:
The search results above contain current financial data. When the user asks about rates, prices, or current information, use the specific data from the search results above. Do NOT say you don't have access to this information when it is provided in the search results.` : ''}

${!searchContext ? `TIER LIMITATIONS:
${tierInfo.limitations.map(limitation => `• ${limitation}`).join('\n')}` : ''}

INSTRUCTIONS:
- Provide clear, actionable financial advice based on available data
- Use specific numbers from the user's data when possible
- Reference current market conditions when relevant and available
- Use real-time financial information when available to provide the most current advice
- Be conversational but professional
- If you don't have enough data, ask for more information
- Always provide source attribution when using external data
- Focus on the user's specific financial situation and goals

FORMATTING GUIDELINES:
- Use proper markdown formatting with clear headers (##, ###)
- Create compact, well-formatted lists without excessive line breaks
- Use numbered lists (1. 2. 3.) for sequential items like accounts
- Use bullet points (- or *) for general lists
- Ensure lists are compact with no blank lines between items
- **IMPORTANT**: Always put the number/bullet and content on the same line (e.g., "1. Account Name: $100" not "1.\nAccount Name: $100")
- Use **bold** for important numbers and percentages
- Use \`code\` blocks for specific rates or calculations
- Separate sections with clear line breaks
- Use blockquotes for important warnings or tips

${!searchContext && tierInfo.unavailableSources.length > 0 ? `
- Be helpful with current tier limitations
- Suggest upgrades when appropriate
- Focus on available data sources` : ''}`;

  return systemPrompt;
}

// Function specifically for tests that uses a cheaper model
export async function askOpenAIForTests(
  question: string, 
  conversationHistory: Conversation[] = [], 
  userTier: UserTier | string = UserTier.STARTER, 
  isDemo: boolean = false, 
  userId?: string
): Promise<string> {
  // Use a cheaper model for tests
  return askOpenAI(question, conversationHistory, userTier, isDemo, userId, 'gpt-3.5-turbo');
}
