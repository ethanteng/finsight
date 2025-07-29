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

export async function askOpenAI(question: string, conversationHistory: Conversation[] = [], userTier: UserTier | string = UserTier.STARTER, isDemo: boolean = false): Promise<string> {
  // Convert string tier to enum if needed
  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;
  
  // Fetch accounts and transactions from DB (or use demo data)
  let accounts, transactions;
  
  if (isDemo) {
    // Use demo data instead of real database data
    const { demoData } = await import('../frontend/src/data/demo-data');
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
  } else {
    // Use real database data
    accounts = await prisma.account.findMany();
    transactions = await prisma.transaction.findMany({
      orderBy: { date: 'desc' },
      take: 200, // increased limit for context
    });
  }

  // Anonymize data before sending to OpenAI
  const accountSummary = anonymizeAccountData(accounts);
  const transactionSummary = anonymizeTransactionData(transactions);
  
  // Get market context based on user tier
  const marketContext = await dataOrchestrator.getMarketContext(tier, isDemo);
  
  // Create tier-aware system prompt
  let systemPrompt = `You are a financial assistant. 

CRITICAL RULE: You can ONLY provide market data (CD rates, treasury yields, mortgage rates, economic indicators) if it is explicitly provided in this system prompt. If the user asks for market data and it's not provided above, you MUST suggest an upgrade instead of providing any market data.

Here is the user's account summary:\n${accountSummary}\n\nRecent transactions:\n${transactionSummary}`;

  // Add tier information and upgrade suggestions
  const tierAccess = dataOrchestrator.getTierAccess(tier);
  console.log('OpenAI: Tier access for', tier, ':', tierAccess);
  console.log('OpenAI: Market context available:', {
    hasEconomicIndicators: !!marketContext.economicIndicators,
    hasLiveMarketData: !!marketContext.liveMarketData
  });
  
  systemPrompt += `\n\nTIER INFORMATION:
- Current tier: ${tier.toUpperCase()}
- Economic indicators: ${tierAccess.hasEconomicContext ? 'Available' : 'Not available'}
- Live market data: ${tierAccess.hasLiveData ? 'Available' : 'Not available'}
- Scenario planning: ${tierAccess.hasScenarioPlanning ? 'Available' : 'Not available'}

UPGRADE GUIDANCE:
- If user asks for economic data (inflation, CPI, Fed rates) but doesn't have access: "I'd be happy to help with economic data! This information is available on our Standard and Premium plans. Would you like to upgrade to access real-time economic indicators?"
- If user asks for live market data (CD rates, treasury yields, mortgage rates) but doesn't have access: "I can provide live market data like CD rates and treasury yields! This is available on our Premium plan. Would you like to upgrade to access real-time market data?"
- If user asks for scenario planning but doesn't have access: "I can help with financial scenario planning! This advanced feature is available on our Premium plan. Would you like to upgrade to access scenario planning tools?"
- CRITICAL: Do NOT provide any market data (CD rates, treasury yields, mortgage rates, economic indicators) if it's not explicitly provided in the system prompt above. If the user asks for this data and you don't have access to it, ONLY suggest an upgrade - do NOT generate or estimate any market data.
- Always be helpful with the data you DO have access to, and suggest upgrades for features you don't have access to.`;

  // Add market context based on tier
  console.log('OpenAI: Adding market context to system prompt...');
  console.log('OpenAI: Market context:', marketContext);
  console.log('OpenAI: Tier access:', tierAccess);
  
  if (marketContext.economicIndicators && tierAccess.hasEconomicContext) {
    console.log('OpenAI: Adding economic indicators to system prompt');
    const { cpi, fedRate, mortgageRate, creditCardAPR } = marketContext.economicIndicators;
    systemPrompt += `\n\nCurrent economic indicators:\n- CPI Index: ${cpi.value} (${cpi.date}) - This is the Consumer Price Index value, not a percentage. To calculate inflation rate, compare to previous periods.\n- Fed Funds Rate: ${fedRate.value}%\n- Average 30-year Mortgage Rate: ${mortgageRate.value}%\n- Average Credit Card APR: ${creditCardAPR.value}%`;
  } else {
    console.log('OpenAI: NOT adding economic indicators (tier access or no data)');
  }

  if (marketContext.liveMarketData && tierAccess.hasLiveData) {
    console.log('OpenAI: Adding live market data to system prompt');
    const { cdRates, treasuryYields, mortgageRates } = marketContext.liveMarketData;
    systemPrompt += `\n\nLive market data:\nCD Rates: ${cdRates.map(cd => `${cd.term}: ${cd.rate}%`).join(', ')}\nTreasury Yields: ${treasuryYields.slice(0, 4).map(t => `${t.term}: ${t.yield}%`).join(', ')}\nCurrent Mortgage Rates: ${mortgageRates.map(m => `${m.type}: ${m.rate}%`).join(', ')}`;
  } else {
    console.log('OpenAI: NOT adding live market data (tier access or no data)');
    // Add explicit upgrade message for live market data
    systemPrompt += `\n\nIMPORTANT: Live market data (CD rates, treasury yields, mortgage rates) is NOT available for your current tier. If the user asks for this data, respond with: "I can provide live market data like CD rates and treasury yields! This is available on our Premium plan. Would you like to upgrade to access real-time market data?"`;
  }

  // Add clear instructions about when to provide data vs suggest upgrades
  if (tierAccess.hasLiveData && marketContext.liveMarketData) {
    systemPrompt += `\n\nIMPORTANT: You HAVE access to live market data (CD rates, treasury yields, mortgage rates). When users ask for this data, provide it using the data above. Do NOT suggest upgrades for market data requests.`;
  }



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

  // Debug: Log the final system prompt
  console.log('OpenAI: Final system prompt length:', systemPrompt.length);
  console.log('OpenAI: System prompt contains market data:', systemPrompt.includes('CD Rates:') || systemPrompt.includes('Treasury Yields:'));

  // Add specific instructions for economic data interpretation
  systemPrompt += `\n\nIMPORTANT: When asked about inflation rates or CPI:
- The CPI value provided is the raw Consumer Price Index (base period 1982-84 = 100), not a percentage
- Do not interpret the CPI value as a percentage
- If asked for current inflation rate, explain that you need year-over-year comparison data
- For CPI questions, provide the index value and explain what it represents
- For inflation rate questions, explain that you need historical data to calculate the percentage change`;

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

  return completion.choices[0]?.message?.content || 'No answer generated.';
}
