/**
 * Financial Reasoning Prompt Template
 *
 * Structured reasoning format for Ask Linc LLM financial analysis.
 * Sections: DATA EXTRACTION, CALCULATION PLAN, CALCULATIONS, INTERPRETATION, GUIDANCE
 */

import { CanonicalFinancialSnapshot, formatCanonicalSnapshotForPrompt } from './canonical-snapshot';
import { FinancialContextSnapshot } from './types';

export interface FinancialReasoningPromptInput {
  question: string;
  canonicalSnapshot: CanonicalFinancialSnapshot;
  userProfile: string;
  marketSummary: string;
  ragKnowledge: string;
  conversationHistory?: Array< { question: string; answer: string }>;
}

const REASONING_SYSTEM_PROMPT = `You are a financial analysis assistant.

You are helping analyze a user's financial situation.

Follow this reasoning structure in your response:

SECTION 1 — DATA EXTRACTION
Identify the relevant financial values from the snapshot or profile.

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
- Do not invent financial data that is not present.
- Clearly state assumptions.
- Show formulas when performing calculations.
- Be conservative with estimates.

CRITICAL - JSON output: At the end of your response, output ONLY a valid JSON object. No other text before or after. Use this exact structure with each key appearing ONCE:
{
  "summary": "One paragraph summary for the user",
  "key_numbers": { "metric_name": number },
  "insights": ["insight 1", "insight 2"],
  "suggested_actions": ["action 1", "action 2"]
}

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
  const { question, canonicalSnapshot, userProfile, marketSummary, ragKnowledge, conversationHistory } = input;

  const contextParts: string[] = [
    '## User Question',
    question,
    '',
    '## Financial Snapshot (canonical)',
    formatCanonicalSnapshotForPrompt(canonicalSnapshot),
    '',
    '## User Profile',
    userProfile || '(No profile available)',
    '',
    '## Daily Market Summary',
    marketSummary || '(No market summary available)',
    '',
    '## Retrieved Financial Knowledge',
    ragKnowledge || '(No additional knowledge retrieved)'
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    contextParts.push('', '## Recent Conversation History');
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
  canonicalSnapshot: CanonicalFinancialSnapshot,
  conversationHistory?: Array<{ question: string; answer: string }>
): FinancialReasoningPromptInput {
  return {
    question,
    canonicalSnapshot,
    userProfile: snapshot.userProfile || '',
    marketSummary: snapshot.marketContext || '',
    ragKnowledge: snapshot.searchContext || '',
    conversationHistory
  };
}
