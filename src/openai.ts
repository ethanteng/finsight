import OpenAI from 'openai';
import { PrismaClient } from '../generated/prisma';
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

export async function askOpenAI(question: string, conversationHistory: Conversation[] = [], userTier: UserTier = UserTier.STARTER): Promise<string> {
  // Fetch accounts and transactions from DB
  const accounts = await prisma.account.findMany();
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: 'desc' },
    take: 200, // increased limit for context
  });

  // Anonymize data before sending to OpenAI
  const accountSummary = anonymizeAccountData(accounts);
  const transactionSummary = anonymizeTransactionData(transactions);
  
  console.log(`AI context: ${transactions.length} transactions, ${accounts.length} accounts, ${conversationHistory.length} conversation pairs, tier: ${userTier}`);

  // Get market context based on user tier
  const marketContext = await dataOrchestrator.getMarketContext(userTier);
  
  let systemPrompt = `You are a financial assistant. Here is the user's account summary:\n${accountSummary}\n\nRecent transactions:\n${transactionSummary}`;

  // Add market context based on tier
  if (marketContext.economicIndicators) {
    const { cpi, fedRate, mortgageRate, creditCardAPR } = marketContext.economicIndicators;
    systemPrompt += `\n\nCurrent economic indicators:\n- CPI: ${cpi.value}% (${cpi.date})\n- Fed Funds Rate: ${fedRate.value}%\n- Average 30-year Mortgage Rate: ${mortgageRate.value}%\n- Average Credit Card APR: ${creditCardAPR.value}%`;
  }

  if (marketContext.liveMarketData) {
    const { cdRates, treasuryYields, mortgageRates } = marketContext.liveMarketData;
    systemPrompt += `\n\nLive market data:\nCD Rates: ${cdRates.map(cd => `${cd.term}: ${cd.rate}%`).join(', ')}\nTreasury Yields: ${treasuryYields.slice(0, 4).map(t => `${t.term}: ${t.yield}%`).join(', ')}\nCurrent Mortgage Rates: ${mortgageRates.map(m => `${m.type}: ${m.rate}%`).join(', ')}`;
  }

  systemPrompt += `\n\nAnswer the user's question using this data. If the user asks to "show all transactions" or "list all transactions", provide a numbered list of individual transactions rather than summarizing them.`;

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
