import OpenAI from 'openai';
import * as Sentry from '@sentry/node';
import { ASK_LINC_RESPONSE_JSON_SCHEMA } from './structured-response';
import { getActiveModel } from './model-config';
import { openAIGenerationParams } from './openai-generation-params';

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
  const response = await getClient().chat.completions.create({
    model,
    ...openAIGenerationParams('fallback', model),
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
  // Same blind spot as the Claude path: a length-stopped completion is a partial
  // answer that still reads like a whole one, and this path only runs when the
  // primary provider is already down.
  if (response.choices[0]?.finish_reason === 'length') {
    const warning = `Ask Linc: OpenAI fallback response truncated at its output ceiling (model=${model}). Raise ASK_LINC_MAX_OUTPUT_TOKENS.`;
    console.warn(warning);
    Sentry.captureMessage(warning, 'warning');
  }

  return response.choices[0]?.message?.content || '';
}
