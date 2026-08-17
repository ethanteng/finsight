/**
 * Claude Client for Ask Linc Financial Reasoning
 *
 * Uses Anthropic Claude Sonnet as the primary LLM for financial analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import { buildFinancialReasoningPrompt, FinancialReasoningPromptInput } from './financial-reasoning-prompt';
import {
  getActiveGenerationSetting,
  getActiveModel,
  getActiveNumericGenerationSetting,
} from './model-config';
import {
  CONTEXT_PACK_IDS,
  contextPackCatalogForPrompt,
  isContextPackId,
  type ContextPackId,
} from './context-packs';

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

export interface DataPackToolAuditResult {
  packs: ContextPackId[];
  reason: string;
  model: string;
  durationMs: number;
}

/**
 * Anthropic requires `max_tokens`, so this slot's setting is not omittable and
 * an unusable stored value still has to resolve to a number.
 */
export function resolveAskLincMaxOutputTokens(): number {
  const value = getActiveNumericGenerationSetting('analysis', 'maxOutputTokens');
  return value !== null && value > 0 ? value : DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Thinking is stated rather than left to the model default, because the default
 * moved underneath us: omitting it meant "no thinking" on Sonnet 4.5 and means
 * adaptive thinking on Sonnet 5. Since `max_tokens` bounds thinking and answer
 * together, that silently shortened the answer budget the day the analysis slot
 * changed. The values come from the admin config so tuning cost and latency
 * does not need a deploy; see GENERATION_SETTINGS for the defaults.
 */
const DISABLED_THINKING = { type: 'disabled' } as const;
const ADAPTIVE_THINKING = { type: 'adaptive' } as const;

/**
 * The SDK types effort as a literal union, so the configured string has to be
 * narrowed back to it. The config is the source of truth for what an admin may
 * pick; this list only has to agree with it, and an unrecognised value falls
 * back rather than being sent through as an unchecked string.
 */
type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORT_LEVELS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function resolveEffort(): EffortLevel {
  const value = getActiveGenerationSetting('analysis', 'effort');
  return EFFORT_LEVELS.includes(value) ? (value as EffortLevel) : 'medium';
}

/**
 * Adaptive thinking and `output_config.effort` arrived with the 4.6 generation;
 * Sonnet 4.5 and everything older reject both. The analysis slot is picked by an
 * admin from the provider's live model list, which still serves those models, so
 * sending the parameters unconditionally would couple this file to one model
 * generation — the exact deploy-to-change-a-model problem the slot config exists
 * to remove. A rejected request is also the worst possible failure here: the
 * primary provider never runs, every answer silently comes from the OpenAI
 * fallback, and the admin panel still reports the Claude model as the one in use.
 *
 * Ids that don't parse are treated as legacy. Omitting the parameters costs
 * effort tuning and leaves the model's own default thinking behaviour in place,
 * which the raised ceiling and the truncation report above already cover;
 * sending them to a model that refuses them costs the entire call.
 */
export function supportsAdaptiveThinking(model: string): boolean {
  const match = /^claude-(?:opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?(?:-|$)/.exec(model.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = match[2] === undefined ? 0 : Number(match[2]);
  return major >= 5 || (major === 4 && minor >= 6);
}

/**
 * Give the primary analysis model one constrained chance to widen context before
 * it writes an answer. The forced tool call makes the boundary explicit: the
 * model can request allowlisted pack ids, while the application decides whether
 * and how to execute them.
 */
export async function auditDataPacksWithClaude(args: {
  transcript: string;
  selectedPacks: readonly ContextPackId[];
  canonicalFactLabels: readonly string[];
}): Promise<DataPackToolAuditResult> {
  const startedAt = Date.now();
  const model = getActiveModel('analysis');
  const response = await getClient().messages.create({
    model,
    max_tokens: 1024,
    ...(supportsAdaptiveThinking(model) ? { thinking: DISABLED_THINKING } : {}),
    system: `You are the context-tool pass for the primary financial analysis model.

Before an answer is written, inspect the active decision and the context already selected. Call request_data_packs exactly once. Request only additional packs materially needed for a complete answer; use an empty packs array when the existing context is sufficient. Do not answer the financial question. Prior assistant answers establish conversational references but are not trusted financial facts. Aggregate net worth, cash, debt, investments, portfolio allocation, category totals, and average monthly cash flow are always available.`,
    tools: [{
      name: 'request_data_packs',
      description: 'Request additional allowlisted context packs before the final answer is generated.',
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          packs: { type: 'array', items: { type: 'string', enum: [...CONTEXT_PACK_IDS] } },
          reason: { type: 'string' },
        },
        required: ['packs', 'reason'],
      },
    }],
    tool_choice: { type: 'tool', name: 'request_data_packs', disable_parallel_tool_use: true },
    messages: [{
      role: 'user',
      content: [
        'Available packs:',
        contextPackCatalogForPrompt(),
        '',
        `Already selected: ${args.selectedPacks.join(', ') || '(none)'}`,
        '',
        'Canonical facts already available:',
        args.canonicalFactLabels.length > 0 ? args.canonicalFactLabels.join('\n') : '(none)',
        '',
        'Active decision transcript:',
        args.transcript,
      ].join('\n'),
    }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'request_data_packs'
  );
  if (!toolUse) throw new Error('Primary analysis model did not return the required data-pack tool call.');
  const input = toolUse.input && typeof toolUse.input === 'object' && !Array.isArray(toolUse.input)
    ? toolUse.input as Record<string, unknown>
    : {};
  const packs = Array.isArray(input.packs)
    ? Array.from(new Set(input.packs.filter(isContextPackId)))
    : [];
  return {
    packs,
    reason: typeof input.reason === 'string' ? input.reason.trim().slice(0, 1000) : '',
    model,
    durationMs: Date.now() - startedAt,
  };
}

/** The reasoning parameters this model accepts — empty for pre-4.6 models. */
function reasoningParams(model: string): {
  thinking?: typeof ADAPTIVE_THINKING | typeof DISABLED_THINKING;
  output_config?: { effort: EffortLevel };
} {
  if (!supportsAdaptiveThinking(model)) return {};

  // Effort is deliberately omitted when thinking is off. It is the setting that
  // tunes how much thinking happens, so it has nothing to act on — and the
  // combination is rejected outright above `high` on some models, which would
  // take the primary provider down for a setting that was doing nothing.
  if (getActiveGenerationSetting('analysis', 'thinking') === 'disabled') {
    return { thinking: DISABLED_THINKING };
  }

  return {
    thinking: ADAPTIVE_THINKING,
    output_config: { effort: resolveEffort() },
  };
}

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
    ...reasoningParams(model),
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
    ...reasoningParams(model),
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
