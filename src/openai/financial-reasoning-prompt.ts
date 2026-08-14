/**
 * Financial Reasoning Prompt Template
 *
 * Concise structured-output prompt for Ask Linc financial analysis.
 */

import { buildFinancialContextForPrompt } from './prompt-builder';
import { getActiveResponseTone } from './prompt-config';
import { FinancialContextSnapshot } from './types';

export interface FinancialReasoningPromptInput {
  question: string;
  /** Full financial context (canonical data). Supersedes any data from conversation history. */
  financialContext: string;
  userProfile: string;
  marketSummary: string;
  ragKnowledge: string;
  /** For context only — what the user has been asking about. NOT canonical data; financial context supersedes. */
  conversationHistory?: Array<{ question: string; answer: string }>;
  /** When present, instructs Claude to fix these validation issues from a previous response. */
  validationFeedback?: string[];
}

function buildReasoningSystemPrompt(): string {
  return `You are Linc, a friendly financial analysis assistant who talks with people like a knowledgeable friend rather than a formal advisor.

Tone for all user-facing fields:
${getActiveResponseTone()}

Grounding and calculation rules:
- Do not invent financial data that is not present in the Financial Context. Never estimate, guess, or fabricate a number that is not derivable from the provided data.
- Treat all monetary amounts as USD unless clearly specified otherwise.
- Values labeled authoritative are exact. Do not recompute net worth, total cash, total investments, total debt, home value, monthly income, or monthly expenses from detail rows.
- For any new arithmetic, verify intermediate values internally and include the concise formula in the summary or an insight when it materially helps the user.
- For spending detail, include only transactions labeled (EXPENSE) or (FEE). Exclude transfers, income, trades, deposits, and withdrawals regardless of sign.
- State material assumptions and data-quality limitations. Be conservative with projections and estimates.

Return only one valid JSON object with this exact shape:
{
  "summary": "One paragraph summary for the user",
  "key_numbers": { "metric_name": number },
  "insights": ["insight 1", "insight 2"],
  "suggested_actions": ["action 1", "action 2"]
}

- key_numbers values must be raw JSON numbers (no "$", "%", or commas). Express percentages and rates in whole-number form, e.g. 4.15 means 4.15% (not 0.0415). Express dollar amounts in full, e.g. 187547.25 (not 187.5).
- Every number must be traceable to the Financial Context or a stated formula.
- Keep arrays to 3-5 items max to avoid truncation.
- Use each key once and emit complete JSON.`;
}

/**
 * Build the full prompt for Claude with all context.
 */
export function buildFinancialReasoningPrompt(input: FinancialReasoningPromptInput): {
  systemPrompt: string;
  userMessage: string;
} {
  const { question, financialContext, userProfile, marketSummary, ragKnowledge, conversationHistory, validationFeedback } = input;

  const contextParts: string[] = [];

  if (validationFeedback && validationFeedback.length > 0) {
    contextParts.push(
      '## Validation Feedback — Must Fix',
      'Your previous response had the following issues. Correct them in your new response:',
      ...validationFeedback.map((issue) => `- ${issue}`),
      '',
      'Use ONLY the financial data provided below. Do not invent numbers or cite analyses not present in the Financial Context.',
      ''
    );
  }

  contextParts.push(
    '## User Question',
    question,
    '',
    '## Financial Context (CANONICAL — use this as the source of truth)',
    'The data below is authoritative. It supersedes any numbers or figures mentioned in Recent Conversation History. Always use values from this section for calculations and analysis.',
    '',
    financialContext || '(No financial data available)'
  );

  if (userProfile) contextParts.push('', '## User Profile', userProfile);
  if (marketSummary) contextParts.push('', '## Daily Market Summary', marketSummary);
  if (ragKnowledge) contextParts.push('', '## Retrieved Financial Knowledge', ragKnowledge);

  if (conversationHistory && conversationHistory.length > 0) {
    contextParts.push(
      '',
      '## Recent Conversation History (context only — NOT canonical data)',
      'Use this only to understand what the user has been asking about. Do NOT use numbers or figures from prior answers as canonical data. The Financial Context above is the source of truth.',
      ''
    );
    for (const entry of conversationHistory.slice(-3)) {
      contextParts.push(
        `Q: ${entry.question.slice(0, 500)}`,
        `A: ${entry.answer.slice(0, 1500)}`,
        ''
      );
    }
  }

  const userMessage = contextParts.join('\n');

  return {
    systemPrompt: buildReasoningSystemPrompt(),
    userMessage
  };
}

/**
 * Build prompt input from FinancialContextSnapshot and related data.
 */
export function buildPromptInputFromSnapshot(
  question: string,
  snapshot: FinancialContextSnapshot,
  conversationHistory?: Array<{ question: string; answer: string }>
): FinancialReasoningPromptInput {
  return {
    question,
    financialContext: buildFinancialContextForPrompt(snapshot),
    userProfile: snapshot.userProfile || '',
    marketSummary: snapshot.marketContext || '',
    ragKnowledge: snapshot.searchContext || '',
    conversationHistory
  };
}
