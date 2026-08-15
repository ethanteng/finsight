/**
 * Financial Reasoning Prompt Template
 *
 * Concise structured-output prompt for Ask Linc financial analysis.
 */

import { getActiveResponseTone } from './prompt-config';
import { FinancialContextSnapshot, QuestionNeeds } from './types';
import { buildCanonicalFactPack, type CanonicalFactPack } from './canonical-facts';
import { buildQuestionContextPack, formatQuestionContextPack } from './context-pack';

export interface FinancialReasoningPromptInput {
  question: string;
  /** Full financial context (canonical data). Supersedes any data from conversation history. */
  financialContext: string;
  userProfile: string;
  marketSummary: string;
  ragKnowledge: string;
  canonicalFacts?: CanonicalFactPack;
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
- Do not invent financial data that is not present in the Canonical Fact Pack.
- Treat all monetary amounts as USD unless clearly specified otherwise.
- Canonical facts are exact. Copy them; never recompute or modify them from detail rows.
- Do not perform authoritative arithmetic. Any supported derived value is already supplied as a fact with calculation provenance.
- If the answer would require a number that is absent from the fact pack, explain what is missing instead of estimating it.
- Never infer the user's age, birth year, or years remaining until a goal. "Retiring by 62" is a target, not a statement that they are 48 — if a retirement analysis is not supplied, say what is missing and reason without a timeline rather than assuming one.
- For spending detail, include only transactions labeled (EXPENSE) or (FEE). Exclude transfers, income, trades, deposits, and withdrawals regardless of sign.
- State material assumptions and data-quality limitations. Be conservative with projections and estimates.

Return only one valid JSON object with this exact shape:
{
  "summary": "One paragraph summary for the user",
  "key_numbers": {
    "metric_name": {
      "value": 187547.25,
      "unit": "usd",
      "provenance": "exact_canonical_fact_id"
    }
  },
  "insights": ["insight 1", "insight 2"],
  "suggested_actions": ["action 1", "action 2"]
}

- Each key number must copy value, unit, and provenance exactly from one supplied canonical fact whose displayable property is not false. Facts marked displayable=false are calculation evidence only. Valid units are usd, percent, months, years, age, count, and ratio.
- Every dollar amount and percentage in your prose must come from a supplied canonical fact. You may round one for readability ($995.57 as "$996", 9.18094% as "9.2%" or "9%"); do not combine, net, or sum facts into a new figure.
- Ages, time horizons, counts, and allocation splits ("age 62", "over 10 years", "a 60/40 mix") are ordinary prose and need no fact, as long as they are not amounts of money.
- If the answer would need a dollar amount or percentage that is absent from the fact pack, say what is missing instead of estimating it. Use words such as "a few" when a recommendation does not need an authoritative number.
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
    '## Question-Specific Context Pack (CANONICAL — use this as the source of truth)',
    'The facts below are authoritative and supersede every number in conversation history. Explain them; do not calculate replacements.',
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
  questionNeeds: QuestionNeeds,
  conversationHistory?: Array<{ question: string; answer: string }>
): FinancialReasoningPromptInput {
  const canonicalFacts = buildCanonicalFactPack(snapshot, question, questionNeeds);
  const contextPack = buildQuestionContextPack(snapshot, questionNeeds, canonicalFacts, question);
  return {
    question,
    financialContext: formatQuestionContextPack(contextPack),
    userProfile: snapshot.userProfile || '',
    marketSummary: snapshot.marketContext || '',
    ragKnowledge: snapshot.searchContext || '',
    conversationHistory,
    canonicalFacts,
  };
}
