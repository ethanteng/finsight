import OpenAI from 'openai';
import { resolveAskLincMaxOutputTokens } from './claude-client';
import { ASK_LINC_RESPONSE_JSON_SCHEMA } from './structured-response';
import { getActiveModel } from './model-config';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for Ask Linc provider fallback.');
    client = new OpenAI({ apiKey });
  }
  return client;
}

/** Use the exact already-built context pack when the primary provider is unavailable. */
export async function askOpenAIWithPreparedPrompt(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const model = getActiveModel('fallback');
  const maxTokens = resolveAskLincMaxOutputTokens();
  const response = await getClient().chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'ask_linc_response',
        strict: true,
        schema: ASK_LINC_RESPONSE_JSON_SCHEMA,
      },
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });
  return response.choices[0]?.message?.content || '';
}
