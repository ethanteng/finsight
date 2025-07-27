import OpenAI from 'openai';
import { PrismaClient } from '../generated/prisma';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const prisma = new PrismaClient();

interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

export async function askOpenAI(question: string, conversationHistory: Conversation[] = []): Promise<string> {
  // Fetch accounts and transactions from DB
  const accounts = await prisma.account.findMany();
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: 'desc' },
    take: 200, // increased limit for context
  });

  // Format data for context with richer metadata
  const accountSummary = accounts.map(a => {
    const balance = a.currentBalance ? `$${a.currentBalance.toFixed(2)}` : 'N/A';
    const available = a.availableBalance ? ` (Available: $${a.availableBalance.toFixed(2)})` : '';
    const limit = a.limit ? ` (Limit: $${a.limit.toFixed(2)})` : '';
    const mask = a.mask ? ` (****${a.mask})` : '';
    const institution = a.institution ? ` at ${a.institution}` : '';
    return `- ${a.name}${mask} (${a.type}${a.subtype ? '/' + a.subtype : ''}): ${balance}${available}${limit}${institution}`;
  }).join('\n');
  
  const transactionSummary = transactions.map(t => {
    const date = t.date.toISOString().slice(0,10);
    const amount = `$${t.amount.toFixed(2)}`;
    const merchant = t.merchantName && t.merchantName !== t.name ? ` (${t.merchantName})` : '';
    const category = t.category ? ` [${t.category}]` : '';
    const pending = t.pending ? ' [PENDING]' : '';
    const paymentMethod = t.paymentMethod ? ` via ${t.paymentMethod}` : '';
    const location = t.location ? ` at ${JSON.parse(t.location).city || 'Unknown location'}` : '';
    return `- [${date}] ${t.name}${merchant}: ${amount}${category}${pending}${paymentMethod}${location}`;
  }).join('\n');
  
  console.log(`AI context: ${transactions.length} transactions, ${accounts.length} accounts, ${conversationHistory.length} conversation pairs`);

  const systemPrompt = `You are a financial assistant. Here is the user's account summary:\n${accountSummary}\n\nRecent transactions:\n${transactionSummary}\n\nAnswer the user's question using only this data. If the user asks to "show all transactions" or "list all transactions", provide a numbered list of individual transactions rather than summarizing them.`;

  // Build conversation context from history
  const conversationContext = conversationHistory
    .reverse() // Show oldest first for context
    .map(conv => `User: ${conv.question}\nAssistant: ${conv.answer}`)
    .join('\n\n');

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
