import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { anonymizeAccountData, anonymizeTransactionData, anonymizeConversationHistory } from './privacy';
import { dataOrchestrator } from './data/orchestrator';
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

// Post-processing function to enforce tier restrictions - will be used in Step 4
function enforceTierRestrictions(answer: string): string {
  // TIER ENFORCEMENT DISABLED - Return original answer without restrictions
  return answer;
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
    // For authenticated users, fetch from database
    try {
      if (userId) {
        console.log('OpenAI: Fetching user-specific data for userId:', userId);
        const { getPrismaClient } = await import('./index');
        const prisma = getPrismaClient();
        
        accounts = await prisma.account.findMany({
          where: { userId },
          include: { transactions: true }
        });
        
        transactions = await prisma.transaction.findMany({
          where: { account: { userId } },
          orderBy: { date: 'desc' },
          take: 50
        });
        
        console.log('OpenAI: Found', accounts.length, 'accounts and', transactions.length, 'transactions for user', userId);
      } else {
        console.log('OpenAI: No userId provided, fetching all data (this should not happen for authenticated users)');
      }
    } catch (error) {
      console.error('OpenAI: Error fetching user data:', error);
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

  // Create account summary
  const accountSummary = accounts.map(account => {
    const balance = isDemo ? account.balance : account.currentBalance;
    const subtype = isDemo ? account.type : account.subtype;
    return `- ${account.name} (${account.type}/${subtype}): $${balance?.toFixed(2) || '0.00'}`;
  }).join('\n');

  // Create transaction summary
  const transactionSummary = transactions.map(transaction => {
    const name = isDemo ? transaction.description : transaction.name;
    const category = isDemo ? transaction.category : transaction.category?.[0];
    return `- ${name} (${category || 'Unknown'}): $${transaction.amount?.toFixed(2) || '0.00'} on ${transaction.date}`;
  }).join('\n');

  console.log('OpenAI: Account summary for AI:', accountSummary);
  console.log('OpenAI: Transaction summary for AI:', transactionSummary);
  console.log('OpenAI: Number of accounts found:', accounts.length);
  console.log('OpenAI: Number of transactions found:', transactions.length);
  console.log('OpenAI: User ID being used:', userId);

  // Get conversation history
  console.log('OpenAI: Conversation history length:', conversationHistory.length);
  if (conversationHistory.length > 0) {
    console.log('OpenAI: Recent conversation questions:', conversationHistory.slice(0, 3).map(c => c.question));
  }

  // For demo mode, use demo data
  if (isDemo) {
    console.log('OpenAI: Demo accounts:', accounts.length);
    console.log('OpenAI: Demo transactions:', transactions.length);
    console.log('OpenAI: Account summary preview:', accountSummary.substring(0, 500));
    console.log('OpenAI: Transaction summary preview:', transactionSummary.substring(0, 500));
    console.log('OpenAI: Full account summary:', accountSummary);
    console.log('OpenAI: Full transaction summary:', transactionSummary);
  }

  // Get market context based on tier
  const { DataOrchestrator } = await import('./data/orchestrator');
  const orchestrator = new DataOrchestrator();
  const marketContext = await orchestrator.getMarketContext(tier, isDemo);
  const tierAccess = orchestrator.getTierAccess(tier);

  console.log('OpenAI: Tier access for', tier, ':', tierAccess);
  console.log('OpenAI: Market context available:', {
    hasEconomicIndicators: !!marketContext.economicIndicators,
    hasLiveMarketData: !!marketContext.liveMarketData
  });

  // Build system prompt
  let systemPrompt = `You are Linc, an AI-powered financial analyst. You help users understand their finances by analyzing their account data and providing clear, actionable insights.

IMPORTANT: You have access to the user's financial data and current market conditions. Use this data to provide personalized, accurate financial advice.

USER'S FINANCIAL DATA:
Accounts:
${accountSummary || 'No accounts found'}

Recent Transactions:
${transactionSummary || 'No transactions found'}

MARKET CONTEXT:
${marketContext.economicIndicators ? `Economic Indicators:
- CPI Index: ${marketContext.economicIndicators.cpi.value} (${marketContext.economicIndicators.cpi.date})
- Fed Funds Rate: ${marketContext.economicIndicators.fedRate.value}%
- Average 30-year Mortgage Rate: ${marketContext.economicIndicators.mortgageRate.value}%
- Average Credit Card APR: ${marketContext.economicIndicators.creditCardAPR.value}%` : 'No economic indicators available'}

${marketContext.liveMarketData ? `Live Market Data:
CD Rates (APY): ${marketContext.liveMarketData.cdRates.map(cd => `${cd.term}: ${cd.rate}%`).join(', ')}
Treasury Yields: ${marketContext.liveMarketData.treasuryYields.slice(0, 4).map(t => `${t.term}: ${t.yield}%`).join(', ')}
Current Mortgage Rates: ${marketContext.liveMarketData.mortgageRates.map(m => `${m.type}: ${m.rate}%`).join(', ')}` : 'No live market data available'}

INSTRUCTIONS:
- Provide clear, actionable financial advice
- Use specific numbers from the user's data
- Reference current market conditions when relevant
- Be conversational but professional
- If you don't have enough data, ask for more information
- Always provide source attribution when using external data`;

  // Add market context based on tier
  console.log('OpenAI: Adding market context to system prompt...');
  console.log('OpenAI: Market context:', marketContext);
  console.log('OpenAI: Tier access:', tierAccess);
  
  if (marketContext.economicIndicators && tierAccess.hasEconomicContext) {
    console.log('OpenAI: Adding economic indicators to system prompt');
    const { cpi, fedRate, mortgageRate, creditCardAPR } = marketContext.economicIndicators;
    systemPrompt += `\n\nAVAILABLE ECONOMIC DATA:\n- CPI Index: ${cpi.value} (${cpi.date}) - This is the Consumer Price Index value, not a percentage. To calculate inflation rate, compare to previous periods.\n- Fed Funds Rate: ${fedRate.value}%\n- Average 30-year Mortgage Rate: ${mortgageRate.value}%\n- Average Credit Card APR: ${creditCardAPR.value}%`;
  } else {
    console.log('OpenAI: NOT adding economic indicators (tier access or no data)');
  }

  if (marketContext.liveMarketData && tierAccess.hasLiveData) {
    console.log('OpenAI: Adding live market data to system prompt');
    const { cdRates, treasuryYields, mortgageRates } = marketContext.liveMarketData;
    systemPrompt += `\n\nAVAILABLE LIVE MARKET DATA:\nCD Rates (APY): ${cdRates.map(cd => `${cd.term}: ${cd.rate}%`).join(', ')}\nTreasury Yields: ${treasuryYields.slice(0, 4).map(t => `${t.term}: ${t.yield}%`).join(', ')}\nCurrent Mortgage Rates: ${mortgageRates.map(m => `${m.type}: ${m.rate}%`).join(', ')}`;
    
    // Add explicit instructions for CD rates
    systemPrompt += `\n\nIMPORTANT: When users ask about "CD rates", "certificate of deposit rates", "APY", or "annual percentage yield", use the CD Rates (APY) data provided above.`;
  } else {
    console.log('OpenAI: NOT adding live market data (tier access or no data)');
  }

  // Add upgrade suggestions for unavailable data
  // TIER ENFORCEMENT DISABLED - No upgrade suggestions needed
  // if (!tierAccess.hasEconomicContext || !marketContext.economicIndicators) {
  //   systemPrompt += `\n\nUPGRADE FOR ECONOMIC DATA: If users ask for economic data (Fed rate, CPI, inflation), respond with: "I'd be happy to help with economic data! This information is available on our Standard and Premium plans. Would you like to upgrade to access real-time economic indicators?"`;
  // }

  // if (!tierAccess.hasLiveData || !marketContext.liveMarketData) {
  //   systemPrompt += `\n\nUPGRADE FOR LIVE MARKET DATA: If users ask for live market data (CD rates, treasury yields, mortgage rates), respond with: "I can provide live market data like CD rates and treasury yields! This is available on our Premium plan. Would you like to upgrade to access real-time market data?"`;
  // }

  // Add clear instructions about when to provide data vs suggest upgrades
  // TIER ENFORCEMENT DISABLED - No restrictions needed
  // systemPrompt += `\n\nCRITICAL: If you do not see the requested market data explicitly listed in this system prompt, you MUST suggest an upgrade. Do NOT make up or generate any market data.`;

  // Debug: Log the final system prompt
  console.log('OpenAI: Final system prompt length:', systemPrompt.length);
  console.log('OpenAI: System prompt contains market data:', systemPrompt.includes('CD Rates:') || systemPrompt.includes('Treasury Yields:'));
  console.log('OpenAI: System prompt contains economic indicators:', systemPrompt.includes('AVAILABLE ECONOMIC DATA:'));
  console.log('OpenAI: System prompt contains upgrade guidance:', systemPrompt.includes('UPGRADE FOR ECONOMIC DATA:'));
  console.log('OpenAI: System prompt contains "HAVE access" instructions:', systemPrompt.includes('HAVE access to economic indicators'));

  systemPrompt += `\n\nAnswer the user's question using this data. If the user asks to "show all transactions" or "list all transactions", provide a numbered list of individual transactions rather than summarizing them.

SOURCE ATTRIBUTION: Always include a brief annotation at the end of your response indicating the source of any external data used:
- If you used FRED data (economic indicators like Fed rate, CPI, mortgage rate): "Source: Federal Reserve Economic Data (FRED)"
- If you used Alpha Vantage data (market data like CD rates, treasury yields): "Source: Alpha Vantage"
- If you used both FRED and Alpha Vantage data: "Sources: Federal Reserve Economic Data (FRED), Alpha Vantage"
- If you only used user's personal financial data: No source annotation needed
- If you suggested an upgrade instead of providing data: No source annotation needed

IMPORTANT: When you provide market data (CD rates, treasury yields, mortgage rates, economic indicators), you MUST include the source attribution at the end of your response.

CRITICAL: Be precise about which data source you used:
- Fed rate, CPI, mortgage rate = FRED
- CD rates, treasury yields = Alpha Vantage
- If you mention both types of data, use "Sources: Federal Reserve Economic Data (FRED), Alpha Vantage"`;

  // Add specific instructions for economic data interpretation
  systemPrompt += `\n\nIMPORTANT: When asked about inflation rates or CPI:
- The CPI value provided is the raw Consumer Price Index (base period 1982-84 = 100), not a percentage
- Do not interpret the CPI value as a percentage
- If asked for current inflation rate, provide the CPI index value and explain what it represents
- For CPI questions, provide the index value and explain what it represents
- For inflation rate questions, provide the CPI index value and explain that it represents the current price level relative to the base period (1982-84 = 100)

IMPORTANT: When asked about APY (Annual Percentage Yield):
- APY is essentially the same as CD rates
- Use the CD rate data provided to answer APY questions
- CD rates represent the yield/return on certificates of deposit, which is the same as APY`;

  // Anonymize conversation history
  const conversationContext = anonymizeConversationHistory(conversationHistory);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history if available
  if (conversationContext) {
    messages.push({ role: 'user', content: `Previous conversation:\n${conversationContext}\n\nCurrent question:` });
  }

  messages.push({ role: 'user', content: question });

  const completion = await openai.chat.completions.create({
    model: model || process.env.OPENAI_MODEL || 'gpt-4o',
    messages,
    max_tokens: 2000,
  });

  const answer = completion.choices[0]?.message?.content || 'No answer generated.';
  return enforceTierRestrictions(answer);
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
