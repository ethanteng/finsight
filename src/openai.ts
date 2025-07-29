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

// Post-processing function to enforce tier restrictions
function enforceTierRestrictions(answer: string, userTier: UserTier, question: string): string {
  // TIER ENFORCEMENT DISABLED - Return original answer without restrictions
  return answer;
}

export async function askOpenAI(question: string, conversationHistory: Conversation[] = [], userTier: UserTier | string = UserTier.STARTER, isDemo: boolean = false): Promise<string> {
  // Convert string tier to enum if needed
  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;
  
  // Fetch accounts and transactions from DB (or use demo data)
  let accounts: any[] = [];
  let transactions: any[] = [];
  
  if (isDemo) {
    // Use demo data instead of real database data
    console.log('OpenAI: Demo mode detected, importing demo data...');
    try {
      // Use require for production compatibility
      const demoDataModule = require('./demo-data.js');
      const { demoData } = demoDataModule;
      console.log('OpenAI: Demo data imported successfully');
      console.log('OpenAI: Demo data structure:', Object.keys(demoData));
      console.log('OpenAI: Demo accounts count:', demoData.accounts?.length || 0);
      console.log('OpenAI: Demo transactions count:', demoData.transactions?.length || 0);
      
      accounts = demoData.accounts.map((account: any) => ({
        id: account.id,
        name: account.name,
        balance: account.balance,
        type: account.type,
        institution: account.institution,
        lastUpdated: new Date(account.lastUpdated)
      }));
      transactions = demoData.transactions.map((transaction: any) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        amount: transaction.amount,
        category: transaction.category,
        date: new Date(transaction.date),
        description: transaction.description
      }));
      
      console.log('OpenAI: Processed accounts:', accounts.length);
      console.log('OpenAI: Processed transactions:', transactions.length);
    } catch (error) {
      console.error('OpenAI: Error importing demo data:', error);
      // Fallback to empty arrays
      accounts = [];
      transactions = [];
    }
  } else {
    // Use real database data
    accounts = await prisma.account.findMany();
    transactions = await prisma.transaction.findMany({
      orderBy: { date: 'desc' },
      take: 200, // increased limit for context
    });
  }

  // Anonymize data before sending to OpenAI (skip for demo mode)
  const accountSummary = isDemo ? 
    `DEMO ACCOUNTS:\n${accounts.map(acc => `- ${acc.name} (${acc.institution}): $${acc.balance.toLocaleString()}`).join('\n')}` : 
    anonymizeAccountData(accounts);
  const transactionSummary = isDemo ? 
    `DEMO TRANSACTIONS:\n${transactions.slice(0, 10).map(t => `- ${t.date}: ${t.description} (${t.category}): $${t.amount}`).join('\n')}` : 
    anonymizeTransactionData(transactions);
  
  // Debug: Log demo data for troubleshooting
  if (isDemo) {
    console.log('OpenAI: Demo accounts:', accounts.length);
    console.log('OpenAI: Demo transactions:', transactions.length);
    console.log('OpenAI: Account summary preview:', accountSummary.substring(0, 500));
    console.log('OpenAI: Transaction summary preview:', transactionSummary.substring(0, 500));
    console.log('OpenAI: Full account summary:', accountSummary);
    console.log('OpenAI: Full transaction summary:', transactionSummary);
  }
  
  // Get market context based on user tier
  const marketContext = await dataOrchestrator.getMarketContext(tier, isDemo);
  
  // Create tier-aware system prompt
  let systemPrompt = `You are a financial assistant. 

IMPORTANT: You have access to the following data in this system prompt:
- Economic indicators (Fed rate, CPI, mortgage rate) if listed below
- Live market data (CD rates, treasury yields) if listed below

Please provide the data when available and include source attribution.

  ${isDemo ? 'DEMO MODE: You are in demo mode with realistic financial data. Use the account and transaction data provided below to answer questions.' : ''}

Here is the user's account summary:\n${accountSummary}\n\nRecent transactions:\n${transactionSummary}

${isDemo ? 'IMPORTANT: The data above is DEMO DATA. When users ask about their balance, accounts, or transactions, use this demo data to provide realistic answers. Do NOT say the data is not available - it IS available in the demo data above.' : ''}`;

  // Add tier information and upgrade suggestions
  const tierAccess = dataOrchestrator.getTierAccess(tier);
  console.log('OpenAI: Tier access for', tier, ':', tierAccess);
  console.log('OpenAI: Market context available:', {
    hasEconomicIndicators: !!marketContext.economicIndicators,
    hasLiveMarketData: !!marketContext.liveMarketData
  });
  
  // Add tier information
  systemPrompt += `\n\nTIER INFORMATION:
- Current tier: ${tier.toUpperCase()}
- Economic indicators: ${tierAccess.hasEconomicContext ? 'Available' : 'Not available'}
- Live market data: ${tierAccess.hasLiveData ? 'Available' : 'Not available'}
- Scenario planning: ${tierAccess.hasScenarioPlanning ? 'Available' : 'Not available'}

DATA ACCESS RULES:
- If economic indicators are provided below, you CAN provide economic data (Fed rate, CPI, mortgage rate)
- If live market data is provided below, you CAN provide live market data (CD rates, treasury yields, mortgage rates)
- If data is NOT provided below, suggest an upgrade instead of providing any market data
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
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 2000,
  });

  const answer = completion.choices[0]?.message?.content || 'No answer generated.';
  return enforceTierRestrictions(answer, tier, question);
}
