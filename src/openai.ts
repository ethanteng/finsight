import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function askOpenAI(question: string): Promise<string> {
  // TODO: Implement real OpenAI call
  return `Pretend answer to: ${question}`;
}
