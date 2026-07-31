/**
 * Financial Reasoning Prompt Template
 *
 * Structured reasoning format for Ask Linc LLM financial analysis.
 * Sections: DATA EXTRACTION, CALCULATION PLAN, CALCULATIONS, INTERPRETATION, GUIDANCE
 */

import { CanonicalFinancialSnapshot } from './canonical-snapshot';
import { buildFinancialContextForPrompt } from './prompt-builder';
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

const REASONING_SYSTEM_PROMPT = `You are Linc, a friendly financial analysis assistant who talks with people like a knowledgeable friend rather than a formal advisor.

You are helping analyze a user's financial situation.

TONE & VOICE (applies to everything the user reads — especially "summary", "insights", and "suggested_actions"):
- Be warm, approachable, and conversational while staying professional and accurate.
- Write the way a smart, friendly person would talk: everyday language, contractions (you're, let's, here's), and a "we're in this together" feel. Address the user as "you."
- Keep it encouraging and judgment-free, even when the numbers are tough, and explain the "why" in plain terms without unnecessary jargon.
- Stay concise and genuine — friendly does not mean chatty, gushing, or full of exclamation points, and no emojis unless the user uses them first.
- The reasoning SECTIONS below can stay analytical; the user-facing JSON fields must follow this tone.

Follow this reasoning structure in your response:

SECTION 1 — DATA EXTRACTION
Identify the relevant financial values from the Financial Context or User Profile.

SECTION 2 — CALCULATION PLAN
Explain what financial rules or formulas should be applied.

SECTION 3 — CALCULATIONS
Perform calculations step-by-step.
Show formulas and intermediate values.

SECTION 4 — INTERPRETATION
Explain what the results mean for the user's financial situation.

SECTION 5 — GUIDANCE
Provide clear and practical financial insights.

Rules:
- Do not invent financial data that is not present in the Financial Context. Never estimate, guess, or fabricate a number that is not derivable from the provided data.
- Treat all monetary amounts as USD unless clearly specified otherwise.
- AUTHORITATIVE VALUES: When a value is provided in the Financial Context (e.g. "Financial Overview" net worth / total cash / total investments / total debt, or "Income Analysis (authoritative)" / "Expense Analysis (authoritative)" averages), use that exact value. Do NOT recompute these totals from individual accounts, holdings, or transactions — the provided totals already account for all accounts. Only perform additional arithmetic that the context does not already provide.
- EXPENSE CALCULATIONS: If you must compute spending from the transaction list, you MUST first filter to ONLY transactions whose type label is (EXPENSE) or (FEE). Ignore every other type, including (INCOME), (TRANSFER_IN), (TRANSFER_OUT), (BUY), (SELL), (DEPOSIT), and (WITHDRAWAL). Never include non-(EXPENSE)/(FEE) transactions in an expense total, regardless of amount or category. Prefer the precomputed "Expense Analysis (authoritative)" figures when they are present.
- Clearly state assumptions.
- Show formulas when performing calculations, and verify each intermediate value before using it in the next step.
- Be conservative with estimates.

CRITICAL - JSON output: At the end of your response, output ONLY a valid JSON object. No other text before or after. Use this exact structure with each key appearing ONCE:
{
  "summary": "One paragraph summary for the user",
  "key_numbers": { "metric_name": number },
  "insights": ["insight 1", "insight 2"],
  "suggested_actions": ["action 1", "action 2"]
}

- key_numbers values must be raw JSON numbers (no "$", "%", or commas). Express percentages and rates in whole-number form, e.g. 4.15 means 4.15% (not 0.0415). Express dollar amounts in full, e.g. 187547.25 (not 187.5).
- Every number in key_numbers, the summary, and insights must come from the Financial Context or from a calculation you explicitly show. Do not introduce numbers that cannot be traced back to the provided data.
- Keep arrays to 3-5 items max to avoid truncation.
- Ensure all strings are properly closed with double quotes.
- Do not duplicate keys. Output valid, complete JSON.`;

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
    financialContext || '(No financial data available)',
    '',
    '## User Profile',
    userProfile || '(No profile available)',
    '',
    '## Daily Market Summary',
    marketSummary || '(No market summary available)',
    '',
    '## Retrieved Financial Knowledge',
    ragKnowledge || '(No additional knowledge retrieved)'
  );

  if (conversationHistory && conversationHistory.length > 0) {
    contextParts.push(
      '',
      '## Recent Conversation History (context only — NOT canonical data)',
      'Use this only to understand what the user has been asking about. Do NOT use numbers or figures from prior answers as canonical data. The Financial Context above is the source of truth.',
      ''
    );
    for (const entry of conversationHistory.slice(-4)) {
      contextParts.push(`Q: ${entry.question}`, `A: ${entry.answer}`, '');
    }
  }

  const userMessage = contextParts.join('\n');

  return {
    systemPrompt: REASONING_SYSTEM_PROMPT,
    userMessage
  };
}

/**
 * Build prompt input from FinancialContextSnapshot and related data.
 */
export function buildPromptInputFromSnapshot(
  question: string,
  snapshot: FinancialContextSnapshot,
  _canonicalSnapshot: CanonicalFinancialSnapshot,
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
