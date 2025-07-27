import OpenAI from 'openai';
import { PrismaClient } from '../generated/prisma';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const prisma = new PrismaClient();

export async function askOpenAI(question: string): Promise<string> {
  // Fetch accounts and transactions from DB
  const accounts = await prisma.account.findMany();
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: 'desc' },
    take: 200, // increased limit for context
  });

  // Format data for context
  const accountSummary = accounts.map(a => `- ${a.name} (${a.type}${a.subtype ? '/' + a.subtype : ''}): $${a.currentBalance ?? 'N/A'}`).join('\n');
  const transactionSummary = transactions.map(t => `- [${t.date.toISOString().slice(0,10)}] ${t.name}: $${t.amount} (${t.category ?? 'Uncategorized'})`).join('\n');
  
  console.log(`AI context: ${transactions.length} transactions, ${accounts.length} accounts`);

  const systemPrompt = `You are a financial assistant. Here is the user's account summary:\n${accountSummary}\n\nRecent transactions:\n${transactionSummary}\n\nAnswer the user's question using only this data. If the user asks to "show all transactions" or "list all transactions", provide a numbered list of individual transactions rather than summarizing them.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    max_tokens: 2000,
  });

  return completion.choices[0]?.message?.content || 'No answer generated.';
}
