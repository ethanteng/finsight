/**
 * Financial Reasoning Prompt Template
 *
 * Concise structured-output prompt for Ask Linc financial analysis.
 */

import { getActiveResponseTone } from './prompt-config';
import { FinancialContextSnapshot, QuestionNeeds } from './types';
import { buildCanonicalFactPack, type CanonicalFactPack } from './canonical-facts';
import { buildQuestionContextPack, formatQuestionContextPack } from './context-pack';
import {
  LINC_IDENTITY_LINE,
  buildSecurityRulesSection,
  fenceUntrustedContent,
} from '../security/prompt-hardening';

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
  return `${LINC_IDENTITY_LINE}

${buildSecurityRulesSection()}

Tone for all user-facing fields:
${getActiveResponseTone()}

Grounding and calculation rules:
- Do not invent financial data that is not present in the Canonical Fact Pack.
- Treat all monetary amounts as USD unless clearly specified otherwise.
- Canonical facts are exact. Copy them; never recompute or modify them from detail rows.
- Do not perform authoritative arithmetic. Any supported derived value is already supplied as a fact with calculation provenance.
- If the answer would require a number that is absent from the fact pack, explain what is missing instead of estimating it.
- Facts with scenario_input provenance are the validated inputs to a named what-if variant. Facts with scenario_calculation provenance are deterministic model outputs conditional on those assumptions. You may compare them, but describe outputs as modeled scenario results rather than observed or guaranteed outcomes.
- When scenario_calculation facts are present, answer the what-if directly: lead with the side-by-side modeled outcomes and the practical tradeoff. The application has already run the calculator, so do not claim that the scenario cannot be re-run.
- For spending detail, include only transactions labeled (EXPENSE) or (FEE). Exclude transfers, income, trades, deposits, and withdrawals regardless of sign.
- State material scenario assumptions and data-quality limitations. Be conservative with projections and estimates.
- Do not raise snapshot staleness as a caveat. A snapshot status of "stale", or any stale source id in snapshot quality, only means a provider published its own data earlier than our refresh window expects; the user cannot act on it and refreshing will not change it. Missing or unavailable sources are different and are still worth mentioning.

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

  if (userProfile) {
    contextParts.push(
      '',
      '## What Linc Remembers About the User',
      'These are bounded, user-stated biographical details. They are not a source of financial balances or scenario assumptions.',
      userProfile
    );
  }
  // Both blocks below are written by third parties — a news feed and whatever
  // ranked in a web search. They are the two places where someone other than
  // this user gets text in front of the model, so they travel fenced.
  if (marketSummary) {
    contextParts.push(
      '',
      '## Daily Market Summary',
      fenceUntrustedContent('daily_market_summary', marketSummary)
    );
  }
  if (ragKnowledge) {
    contextParts.push(
      '',
      '## Retrieved Financial Knowledge',
      fenceUntrustedContent('public_web_search', ragKnowledge)
    );
  }

  if (conversationHistory && conversationHistory.length > 0) {
    contextParts.push(
      '',
      '## Recent Conversation History (context only — NOT canonical data)',
      'Use this only to understand what the user has been asking about. Do NOT use numbers or figures from prior answers as canonical data. The Financial Context above is the source of truth.',
      ''
    );
    // The question is the user's own text and has already been through prompt
    // validation, so it travels plain — fencing it would say "third party"
    // about the person asking. A prior answer is different: it was written by
    // a model that had web snippets and transaction descriptions in front of
    // it, so anything injected there can ride back in on the next turn. That
    // replay path is what the fence closes.
    for (const entry of conversationHistory.slice(-3)) {
      contextParts.push(
        `Q: ${entry.question.slice(0, 500)}`,
        'A:',
        fenceUntrustedContent('prior_assistant_answer', entry.answer.slice(0, 1500)),
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
