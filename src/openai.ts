import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { anonymizeAccountData, anonymizeTransactionData, anonymizeConversationHistory } from './privacy';
import { dataOrchestrator, TierAwareContext } from './data/orchestrator';
import { UserTier } from './data/types';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const prisma = new PrismaClient();

interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

// Enhanced post-processing function with tier-aware upgrade suggestions
function enhanceResponseWithUpgrades(answer: string, tierContext: TierAwareContext): string {
  if (tierContext.upgradeHints.length === 0) {
    return answer;
  }

  const upgradeSection = `

💡 **Want more insights?** Upgrade your plan to access:
${tierContext.upgradeHints.map(hint => `• **${hint.feature}**: ${hint.benefit}`).join('\n')}

*Your current tier: ${tierContext.tierInfo.currentTier}*
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
  model?: string
): Promise<string> {
  // Convert string tier to enum if needed
  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;

  console.log('OpenAI Enhanced: Starting enhanced context request for tier:', tier, 'isDemo:', isDemo);

  // Get user-specific data
  let accounts: any[] = [];
  let transactions: any[] = [];

  // For demo mode, use demo data instead of database data
  if (isDemo) {
    console.log('OpenAI Enhanced: Using demo data for accounts and transactions');
    try {
      const { demoData } = await import('./demo-data');
      accounts = demoData.accounts || [];
      transactions = demoData.transactions || [];
      console.log('OpenAI Enhanced: Demo data loaded - accounts:', accounts.length, 'transactions:', transactions.length);
    } catch (error) {
      console.error('OpenAI Enhanced: Error loading demo data:', error);
    }
  } else {
    // For authenticated users, fetch from database first, then Plaid if needed
    try {
      if (userId) {
        console.log('OpenAI Enhanced: Fetching user-specific data for userId:', userId);
        const { getPrismaClient } = await import('./index');
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
          
          try {
            // Import Plaid functions directly
            const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
            
            const configuration = new Configuration({
              basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
              baseOptions: {
                headers: {
                  'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
                  'PLAID-SECRET': process.env.PLAID_SECRET,
                },
              },
            });
            
            const plaidClient = new PlaidApi(configuration);
            
            // Get all access tokens
            const accessTokens = await prisma.accessToken.findMany();
            
            if (accessTokens.length > 0) {
              console.log('OpenAI Enhanced: Found', accessTokens.length, 'access tokens');
              
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
            }
          } catch (plaidError) {
            console.error('OpenAI Enhanced: Error fetching from Plaid directly:', plaidError);
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

  // Anonymize data before sending to OpenAI (skip for demo mode)
  if (!isDemo) {
    accounts = accounts.map(account => ({
      ...account,
      name: `Account_${account.id.slice(-4)}`,
      plaidAccountId: `plaid_${account.id.slice(-8)}`
    }));
    
    transactions = transactions.map(transaction => ({
      ...transaction,
      name: transaction.name ? `Transaction_${transaction.id.slice(-4)}` : 'Unknown',
      merchantName: transaction.merchantName ? `Merchant_${transaction.id.slice(-4)}` : 'Unknown'
    }));
  }

  // Get enhanced market context (proactively cached)
  console.log('OpenAI Enhanced: Getting enhanced market context for tier:', tier);
  const marketContextSummary = await dataOrchestrator.getMarketContextSummary(tier, isDemo);
  console.log('OpenAI Enhanced: Market context summary length:', marketContextSummary.length);

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
    return `- ${account.name} (${account.type}/${subtype}): $${balance?.toFixed(2) || '0.00'}`;
  }).join('\n');

  // Create transaction summary
  const transactionSummary = tierContext.transactions.map(transaction => {
    const name = isDemo ? transaction.description : transaction.name;
    const category = isDemo ? transaction.category : transaction.category?.[0];
    // Fix: Invert the transaction amount sign to match expected behavior
    // Positive amounts should be negative (money leaving account) and vice versa
    const correctedAmount = -(transaction.amount || 0);
    return `- ${name} (${category || 'Unknown'}): $${correctedAmount?.toFixed(2) || '0.00'} on ${transaction.date}`;
  }).join('\n');

  console.log('OpenAI Enhanced: Account summary for AI:', accountSummary);
  console.log('OpenAI Enhanced: Transaction summary for AI:', transactionSummary);
  console.log('OpenAI Enhanced: Number of accounts found:', tierContext.accounts.length);
  console.log('OpenAI Enhanced: Number of transactions found:', tierContext.transactions.length);
  console.log('OpenAI Enhanced: User ID being used:', userId);

  // Get conversation history
  console.log('OpenAI Enhanced: Conversation history length:', conversationHistory.length);
  if (conversationHistory.length > 0) {
    console.log('OpenAI Enhanced: Recent conversation questions:', conversationHistory.slice(0, 3).map(c => c.question));
  }

  // For demo mode, use demo data
  if (isDemo) {
    console.log('OpenAI Enhanced: Demo accounts:', tierContext.accounts.length);
    console.log('OpenAI Enhanced: Demo transactions:', tierContext.transactions.length);
    console.log('OpenAI Enhanced: Account summary preview:', accountSummary.substring(0, 500));
    console.log('OpenAI Enhanced: Transaction summary preview:', transactionSummary.substring(0, 500));
    console.log('OpenAI Enhanced: Full account summary:', accountSummary);
    console.log('OpenAI Enhanced: Full transaction summary:', transactionSummary);
  }

  // Build enhanced system prompt with proactive market context
  const systemPrompt = buildEnhancedSystemPrompt(tierContext, accountSummary, transactionSummary, marketContextSummary);

  console.log('OpenAI Enhanced: System prompt length:', systemPrompt.length);
  console.log('OpenAI Enhanced: System prompt preview:', systemPrompt.substring(0, 500));

  // Prepare conversation history for OpenAI
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Add conversation history (last 5 exchanges to stay within token limits)
  const recentHistory = conversationHistory.slice(-10);
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

    // Enhance response with upgrade suggestions
    answer = enhanceResponseWithUpgrades(answer, tierContext);

    console.log('OpenAI Enhanced: Response generated successfully');
    return answer;
  } catch (error) {
    console.error('OpenAI Enhanced: Error calling OpenAI API:', error);
    throw new Error('Failed to get AI response');
  }
}

/**
 * Enhanced system prompt builder with proactive market context
 */
function buildEnhancedSystemPrompt(
  tierContext: TierAwareContext, 
  accountSummary: string, 
  transactionSummary: string,
  marketContextSummary: string
): string {
  const { tierInfo, upgradeHints } = tierContext;

  let systemPrompt = `You are Linc, an AI-powered financial analyst. You help users understand their finances by analyzing their account data and providing clear, actionable insights.

IMPORTANT: You have access to the user's financial data and current market conditions based on their subscription tier. Use this data to provide personalized, accurate financial advice.

USER'S FINANCIAL DATA:
Accounts:
${accountSummary || 'No accounts found'}

Recent Transactions:
${transactionSummary || 'No transactions found'}

USER TIER: ${tierInfo.currentTier.toUpperCase()}

AVAILABLE DATA SOURCES:
${tierInfo.availableSources.length > 0 ? tierInfo.availableSources.map(source => `• ${source}`).join('\n') : '• Account data only'}

${tierInfo.unavailableSources.length > 0 ? `UNAVAILABLE DATA SOURCES (upgrade to access):
${tierInfo.unavailableSources.map(source => `• ${source}`).join('\n')}` : ''}

${marketContextSummary ? `ENHANCED MARKET CONTEXT:
${marketContextSummary}` : 'No market context available (upgrade to Standard tier)'}

TIER LIMITATIONS:
${tierInfo.limitations.map(limitation => `• ${limitation}`).join('\n')}

INSTRUCTIONS:
- Provide clear, actionable financial advice based on available data
- Use specific numbers from the user's data when possible
- Reference current market conditions when relevant and available
- Be conversational but professional
- If you don't have enough data, ask for more information
- Always provide source attribution when using external data
- Be helpful with current tier limitations
- When relevant, mention upgrade benefits for unavailable features
- Focus on the user's specific financial situation and goals
- Use the enhanced market context to provide more informed recommendations`;

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
        const { getPrismaClient } = await import('./index');
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
        
        console.log('OpenAI: Found', accounts.length, 'accounts and', transactions.length, 'transactions in database for user', userId);
        
        // If no data in database, try to fetch from Plaid directly
        if (accounts.length === 0 || transactions.length === 0) {
          console.log('OpenAI: No data in database, fetching from Plaid directly');
          
          try {
            // Import Plaid functions directly
            const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
            
            const configuration = new Configuration({
              basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
              baseOptions: {
                headers: {
                  'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
                  'PLAID-SECRET': process.env.PLAID_SECRET,
                },
              },
            });
            
            const plaidClient = new PlaidApi(configuration);
            
            // Get all access tokens
            const accessTokens = await prisma.accessToken.findMany();
            
            if (accessTokens.length > 0) {
              console.log('OpenAI: Found', accessTokens.length, 'access tokens');
              
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
                  console.log('OpenAI: Fetched', accountsWithBalances.length, 'accounts from Plaid');
                } catch (error) {
                  console.error('OpenAI: Error fetching accounts from token:', error);
                }
              }
              
              // Fetch transactions from all tokens
              const endDate = new Date().toISOString().split('T')[0];
              const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
              
              for (const tokenRecord of accessTokens) {
                try {
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
                  console.log('OpenAI: Fetched', processedTransactions.length, 'transactions from Plaid');
                } catch (error) {
                  console.error('OpenAI: Error fetching transactions from token:', error);
                }
              }
            }
          } catch (plaidError) {
            console.error('OpenAI: Error fetching from Plaid directly:', plaidError);
          }
        }
        
        console.log('OpenAI: Final count -', accounts.length, 'accounts and', transactions.length, 'transactions for user', userId);
      } else {
        console.log('OpenAI: No userId provided, fetching all data (this should not happen for authenticated users)');
      }
    } catch (error) {
      console.error('OpenAI: Error fetching user data:', error);
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
      merchantName: transaction.merchantName ? `Merchant_${transaction.id.slice(-4)}` : 'Unknown'
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
    const category = isDemo ? transaction.category : transaction.category?.[0];
    // Fix: Invert the transaction amount sign to match expected behavior
    // Positive amounts should be negative (money leaving account) and vice versa
    const correctedAmount = -(transaction.amount || 0);
    return `- ${name} (${category || 'Unknown'}): $${correctedAmount?.toFixed(2) || '0.00'} on ${transaction.date}`;
  }).join('\n');

  console.log('OpenAI: Account summary for AI:', accountSummary);
  console.log('OpenAI: Transaction summary for AI:', transactionSummary);
  console.log('OpenAI: Number of accounts found:', tierContext.accounts.length);
  console.log('OpenAI: Number of transactions found:', tierContext.transactions.length);
  console.log('OpenAI: User ID being used:', userId);

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

  // Build enhanced system prompt with tier-aware context
  const systemPrompt = buildTierAwareSystemPrompt(tierContext, accountSummary, transactionSummary);

  console.log('OpenAI: System prompt length:', systemPrompt.length);
  console.log('OpenAI: System prompt preview:', systemPrompt.substring(0, 500));

  // Prepare conversation history for OpenAI
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Add conversation history (last 5 exchanges to stay within token limits)
  const recentHistory = conversationHistory.slice(-10);
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

    // Enhance response with upgrade suggestions
    answer = enhanceResponseWithUpgrades(answer, tierContext);

    console.log('OpenAI: Response generated successfully');
    return answer;
  } catch (error) {
    console.error('OpenAI: Error calling OpenAI API:', error);
    throw new Error('Failed to get AI response');
  }
}

function buildTierAwareSystemPrompt(
  tierContext: TierAwareContext, 
  accountSummary: string, 
  transactionSummary: string
): string {
  const { tierInfo, marketContext, upgradeHints } = tierContext;

  let systemPrompt = `You are Linc, an AI-powered financial analyst. You help users understand their finances by analyzing their account data and providing clear, actionable insights.

IMPORTANT: You have access to the user's financial data and current market conditions based on their subscription tier. Use this data to provide personalized, accurate financial advice.

USER'S FINANCIAL DATA:
Accounts:
${accountSummary || 'No accounts found'}

Recent Transactions:
${transactionSummary || 'No transactions found'}

USER TIER: ${tierInfo.currentTier.toUpperCase()}

AVAILABLE DATA SOURCES:
${tierInfo.availableSources.length > 0 ? tierInfo.availableSources.map(source => `• ${source}`).join('\n') : '• Account data only'}

${tierInfo.unavailableSources.length > 0 ? `UNAVAILABLE DATA SOURCES (upgrade to access):
${tierInfo.unavailableSources.map(source => `• ${source}`).join('\n')}` : ''}

MARKET CONTEXT:
${marketContext.economicIndicators ? `Economic Indicators:
- CPI Index: ${marketContext.economicIndicators.cpi.value} (${marketContext.economicIndicators.cpi.date})
- Fed Funds Rate: ${marketContext.economicIndicators.fedRate.value}%
- Average 30-year Mortgage Rate: ${marketContext.economicIndicators.mortgageRate.value}%
- Average Credit Card APR: ${marketContext.economicIndicators.creditCardAPR.value}%` : 'No economic indicators available (upgrade to Standard tier)'}

${marketContext.liveMarketData ? `Live Market Data:
CD Rates (APY): ${marketContext.liveMarketData.cdRates.map(cd => `${cd.term}: ${cd.rate}%`).join(', ')}
Treasury Yields: ${marketContext.liveMarketData.treasuryYields.slice(0, 4).map(t => `${t.term}: ${t.yield}%`).join(', ')}
Current Mortgage Rates: ${marketContext.liveMarketData.mortgageRates.map(m => `${m.type}: ${m.rate}%`).join(', ')}` : 'No live market data available (upgrade to Premium tier)'}

TIER LIMITATIONS:
${tierInfo.limitations.map(limitation => `• ${limitation}`).join('\n')}

INSTRUCTIONS:
- Provide clear, actionable financial advice based on available data
- Use specific numbers from the user's data when possible
- Reference current market conditions when relevant and available
- Be conversational but professional
- If you don't have enough data, ask for more information
- Always provide source attribution when using external data
- Be helpful with current tier limitations
- When relevant, mention upgrade benefits for unavailable features
- Focus on the user's specific financial situation and goals`;

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
