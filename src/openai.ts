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
function enhanceResponseWithUpgrades(answer: string, tierContext: TierAwareContext, searchContext?: string): string {
  // Don't add upgrade suggestions if search context is available (user already has access to real-time data)
  if (searchContext || tierContext.upgradeHints.length === 0) {
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

  // Get user profile if available
  let userProfile: string = '';
  if (userId && !isDemo) {
    try {
      const { ProfileManager } = await import('./profile/manager');
      const profileManager = new ProfileManager();
      userProfile = await profileManager.getOrCreateProfile(userId);
      console.log('OpenAI Enhanced: User profile retrieved, length:', userProfile.length);
      
      // Enhance profile with Plaid data if available
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
            // Update the profile with Plaid insights
            await profileManager.updateProfile(userId, enhancedProfile);
            userProfile = enhancedProfile;
            console.log('OpenAI Enhanced: User profile enhanced with Plaid data');
          }
        } catch (error) {
          console.error('OpenAI Enhanced: Failed to enhance profile with Plaid data:', error);
          // Don't fail the main request if Plaid enhancement fails
        }
      }
    } catch (error) {
      console.error('OpenAI Enhanced: Failed to get user profile:', error);
      // Don't fail the main request if profile retrieval fails
    }
  }

  // Build enhanced system prompt with proactive market context
  const systemPrompt = buildEnhancedSystemPrompt(tierContext, accountSummary, transactionSummary, marketContextSummary, searchContext, userProfile);

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
    answer = enhanceResponseWithUpgrades(answer, tierContext, searchContext);

    console.log('OpenAI Enhanced: Response generated successfully');
    
    // Update user profile from conversation (for authenticated users only)
    if (userId && !isDemo) {
      try {
        const { ProfileManager } = await import('./profile/manager');
        const profileManager = new ProfileManager();
        await profileManager.updateProfileFromConversation(userId, {
          id: 'temp',
          question,
          answer,
          createdAt: new Date()
        });
        console.log('OpenAI Enhanced: User profile updated from conversation');
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
 * Enhanced system prompt builder with proactive market context
 */
function buildEnhancedSystemPrompt(
  tierContext: TierAwareContext, 
  accountSummary: string, 
  transactionSummary: string,
  marketContextSummary: string,
  searchContext?: string,
  userProfile?: string
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
- Be conversational but professional
- If you don't have enough data, ask for more information
- Always provide source attribution when using external data
- Focus on the user's specific financial situation and goals
- Use the enhanced market context to provide more informed recommendations
- When using search results, prioritize the most recent and relevant information
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
            
            // Get access tokens for the current user only
            const accessTokens = await prisma.accessToken.findMany({
              where: { userId }
            });
            
            if (accessTokens.length > 0) {
              console.log('OpenAI: Found', accessTokens.length, 'access tokens for user', userId);
              
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

  // Get user profile if available
  let userProfile: string = '';
  if (userId && !isDemo) {
    try {
      const { ProfileManager } = await import('./profile/manager');
      const profileManager = new ProfileManager();
      userProfile = await profileManager.getOrCreateProfile(userId);
      console.log('OpenAI: User profile retrieved, length:', userProfile.length);
      
      // Enhance profile with Plaid data if available
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
            // Update the profile with Plaid insights
            await profileManager.updateProfile(userId, enhancedProfile);
            userProfile = enhancedProfile;
            console.log('OpenAI: User profile enhanced with Plaid data');
          }
        } catch (error) {
          console.error('OpenAI: Failed to enhance profile with Plaid data:', error);
          // Don't fail the main request if Plaid enhancement fails
        }
      }
    } catch (error) {
      console.error('OpenAI: Failed to get user profile:', error);
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
    answer = enhanceResponseWithUpgrades(answer, tierContext, searchContext);

    console.log('OpenAI: Response generated successfully');
    
    // Update user profile from conversation (for authenticated users only)
    if (userId && !isDemo) {
      try {
        const { ProfileManager } = await import('./profile/manager');
        const profileManager = new ProfileManager();
        await profileManager.updateProfileFromConversation(userId, {
          id: 'temp',
          question,
          answer,
          createdAt: new Date()
        });
        console.log('OpenAI: User profile updated from conversation');
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

${userProfile && userProfile.trim() ? `USER PROFILE:
${userProfile}

Use this profile information to provide more personalized and relevant financial advice.
Consider the user's personal situation, family status, occupation, and financial goals when making recommendations.

` : ''}

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
- When using search results, prioritize the most recent and relevant information
${!searchContext && tierInfo.unavailableSources.length > 0 ? `
- Be helpful with current tier limitations
- When relevant, mention upgrade benefits for unavailable features` : ''}`;

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
