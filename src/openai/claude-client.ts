/**
 * Claude Client for Ask Linc Financial Reasoning
 *
 * Uses Anthropic Claude Sonnet as the primary LLM for financial analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildFinancialReasoningPrompt, FinancialReasoningPromptInput } from './financial-reasoning-prompt';

const DEFAULT_MODEL = 'claude-sonnet-4-5';

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Ask Linc pipeline. Set it in your environment.');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export interface AskClaudeOptions {
  model?: string;
  maxTokens?: number;
}

function configuredMaxTokens(): number {
  const value = Number.parseInt(process.env.ASK_LINC_MAX_OUTPUT_TOKENS || '8192', 10);
  return Number.isFinite(value) && value > 0 ? value : 8192;
}

/**
 * Call Claude Sonnet with a pre-built prompt (system + user message).
 * Lets callers that already built the prompt (e.g. for Show the Math) avoid
 * rebuilding the large reasoning prompt a second time.
 */
export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options: AskClaudeOptions = {}
): Promise<string> {
  const client = getClient();
  const model = options.model || DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? configuredMaxTokens();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  const textBlock = response.content.find((block): block is { type: 'text'; text: string } => block.type === 'text');
  return textBlock?.text ?? '';
}

/**
 * Call Claude Sonnet with a pre-built prompt and stream text deltas via `onText`.
 * Resolves with the complete text once the stream finishes. Streaming failures in
 * `onText` are swallowed so UI streaming can never break the underlying call.
 */
export async function askClaudeStream(
  systemPrompt: string,
  userMessage: string,
  onText: (delta: string) => void,
  options: AskClaudeOptions = {}
): Promise<string> {
  const client = getClient();
  const model = options.model || DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? configuredMaxTokens();

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  stream.on('text', (textDelta: string) => {
    try {
      onText(textDelta);
    } catch {
      /* never let UI streaming break the model call */
    }
  });

  const finalMessage = await stream.finalMessage();
  const textBlock = finalMessage.content.find((block): block is { type: 'text'; text: string } => block.type === 'text');
  return textBlock?.text ?? '';
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
  return askClaude(systemPrompt, userMessage, options);
}
