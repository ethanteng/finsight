/**
 * Claude Client for Ask Linc Financial Reasoning
 *
 * Uses Anthropic Claude Sonnet as the primary LLM for financial analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import { buildFinancialReasoningPrompt, FinancialReasoningPromptInput } from './financial-reasoning-prompt';
import { getActiveModel } from './model-config';

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

export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

/** Shared by the primary Claude path and the OpenAI fallback so both honor the same ceiling. */
export function resolveAskLincMaxOutputTokens(): number {
  const value = Number.parseInt(
    process.env.ASK_LINC_MAX_OUTPUT_TOKENS || String(DEFAULT_MAX_OUTPUT_TOKENS),
    10
  );
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Thinking is stated rather than left to the model default, because the default
 * moved underneath us: omitting it meant "no thinking" on Sonnet 4.5 and means
 * adaptive thinking on Sonnet 5. Since `max_tokens` bounds thinking and answer
 * together, that silently shortened the answer budget the day the analysis slot
 * changed. Medium effort pulls the spend back below the `high` default while
 * keeping the reasoning that grounds a numbers-heavy answer.
 */
const THINKING_CONFIG = { type: 'adaptive' } as const;
const EFFORT_CONFIG = { effort: 'medium' } as const;

/**
 * A response that stopped on `max_tokens` is a partial answer that still parses
 * far enough to look like a whole one, so nothing downstream notices. Report it
 * — the fix is a bigger budget or less thinking, and neither is discoverable
 * from the truncated text alone.
 */
function reportIfTruncated(stopReason: string | null | undefined, model: string): void {
  if (stopReason !== 'max_tokens') return;
  const message = `Ask Linc: Claude response truncated at max_tokens (model=${model}). Raise ASK_LINC_MAX_OUTPUT_TOKENS or lower thinking effort.`;
  console.warn(message);
  Sentry.captureMessage(message, 'warning');
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
  const model = options.model || getActiveModel('analysis');
  const maxTokens = options.maxTokens ?? resolveAskLincMaxOutputTokens();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    thinking: THINKING_CONFIG,
    output_config: EFFORT_CONFIG,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  reportIfTruncated(response.stop_reason, model);

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
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
  const model = options.model || getActiveModel('analysis');
  const maxTokens = options.maxTokens ?? resolveAskLincMaxOutputTokens();

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    thinking: THINKING_CONFIG,
    output_config: EFFORT_CONFIG,
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
  reportIfTruncated(finalMessage.stop_reason, model);

  const textBlock = finalMessage.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
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
