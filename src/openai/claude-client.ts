/**
 * Claude Client for Ask Linc Financial Reasoning
 *
 * Uses Anthropic Claude Sonnet as the primary LLM for financial analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildFinancialReasoningPrompt, FinancialReasoningPromptInput } from './financial-reasoning-prompt';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required for Ask Linc pipeline. Set it in your environment.');
    }
    anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

export interface AskClaudeOptions {
  model?: string;
  maxTokens?: number;
}

/**
 * Call Claude Sonnet with financial reasoning context.
 * Returns the raw text response from the model.
 */
export async function askClaudeWithFinancialContext(
  input: FinancialReasoningPromptInput,
  options: AskClaudeOptions = {}
): Promise<string> {
  const { systemPrompt, userMessage } = buildFinancialReasoningPrompt(input);
  const client = getClient();
  const model = options.model || DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? 4096;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  const textBlock = response.content.find((block): block is { type: 'text'; text: string } => block.type === 'text');
  return textBlock?.text ?? '';
}
