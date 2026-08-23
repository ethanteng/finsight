/**
 * Optional Response Validator using Gemini
 *
 * Validates Ask Linc structured responses for:
 * - Calculation consistency
 * - Logical reasoning
 * - Unsupported assumptions
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AskLincResponse } from './structured-response';
import { FinancialContextSnapshot } from './types';
import { mergeAssetAllocation } from '../services/asset-class';
import { getActiveModel, getActiveNumericGenerationSetting } from './model-config';

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';

export interface ValidationResult {
  valid: boolean;
  issues?: string[];
  /** Full prompt sent to Gemini (for Show the Math) */
  promptSent?: string;
  /** Raw text response from Gemini (for Show the Math) */
  rawResponse?: string;
}

let genAIClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAIClient) {
    if (!GOOGLE_AI_API_KEY) {
      throw new Error('GOOGLE_AI_API_KEY or GEMINI_API_KEY is required for response validation.');
    }
    genAIClient = new GoogleGenerativeAI(GOOGLE_AI_API_KEY);
  }
  return genAIClient;
}

const VALIDATION_PROMPT = `You are a financial response validator. Your job is to check if a financial analysis response is consistent and well-reasoned.

Given:
1. The user's question
2. The financial context that was available to the model (snapshot with portfolio, holdings, retirement data, etc.)
3. The financial analysis response (with summary, key_numbers, insights, suggested_actions)

Check for:
- Calculation consistency: Do the key_numbers align with the summary and insights?
- Logical reasoning: Are the conclusions supported by the data?
- Unsupported assumptions: Does the response invent data NOT present in the financial context? (If the snapshot contains portfolio value, holdings, withdrawal amounts, remembered personal context, etc., the response may use them—do NOT flag as invented. Age, household, occupation and retirement status supplied under "Remembered personal context" are user-stated facts the response is entitled to reason from, and the counts under "Data quality" are the basis for any statement that connections are not reporting or that totals are incomplete.)
- Formula errors: Are any financial formulas (e.g., 4% rule, debt-to-income) applied correctly?

Respond with a JSON object:
- If valid: { "valid": true }
- If invalid: { "valid": false, "issues": ["issue 1", "issue 2", ...] }

Be strict but fair. Only flag real problems.`;

/**
 * Format a rate stored as a decimal fraction for Gemini validation context.
 * Retirement metrics use 0.1538 = 15.38%, 0.08 = 8%. Values already above 1
 * remain fractions (e.g. 1.5 = 150% annual withdrawal / portfolio).
 */
export function formatMetricPercent(value: unknown, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Connection gaps, counted the way `collectMissingInputAsks` counts them, so
 * the reviewer sees the same number the user is shown. The advisory
 * annotations are excluded there because reconnecting cannot clear them, and a
 * reviewer told a different number would object to the answer's own wording.
 */
function countConnectionGaps(
  quality: NonNullable<NonNullable<FinancialContextSnapshot['financialSummary']>['quality']>
): number {
  return new Set(
    [...(quality.requiredUnavailableSourceIds ?? []), ...(quality.unavailableSourceIds ?? [])]
      .filter((id) => !id.endsWith(':holdings-coverage') && !id.endsWith(':balance-derived'))
  ).size;
}

/**
 * Bounded per line rather than by slicing the block: the reviewer needs to
 * recognize these details, not to store them, and `formatPersonalContextForModel`
 * writes occupation, employment status and retirement status last. A prefix cut
 * would drop exactly the fields the reported objection was about.
 */
const MAX_PERSONAL_CONTEXT_LINE_CHARS = 200;
const MAX_PERSONAL_CONTEXT_LINES = 20;

function boundedPersonalContext(profile: string): string {
  return profile
    .split('\n')
    .slice(0, MAX_PERSONAL_CONTEXT_LINES)
    .map((line) => (line.length > MAX_PERSONAL_CONTEXT_LINE_CHARS
      ? `${line.slice(0, MAX_PERSONAL_CONTEXT_LINE_CHARS)}…`
      : line))
    .join('\n');
}

/**
 * Build a compact summary of the financial snapshot for validation.
 * Gives Gemini enough context to know what data was available to Claude.
 *
 * Exported for unit testing: what this omits, the reviewer treats as invented.
 */
export function buildSnapshotSummaryForValidation(snapshot: FinancialContextSnapshot): string {
  const parts: string[] = [];

  // The primary model is shown this block whenever the plan asks for it, so an
  // answer may legitimately say the user is retired or 77. Leaving it out here
  // made the reviewer object to demographics it simply could not see, which
  // costs a regeneration and puts a caveat on a sound answer.
  if (snapshot.userProfile) {
    parts.push(
      `Remembered personal context (user-stated biographical details, not financial balances):\n${boundedPersonalContext(snapshot.userProfile)}`
    );
  }

  // Same omission, different field. The question context pack hands the primary
  // model `financialSummary.quality`, so an answer may legitimately say that
  // some connections are not reporting and that the totals are therefore
  // incomplete. Without the counts here the reviewer read a sourced caveat as
  // invented data. Real snapshots always carry a quality object, so only emit
  // this block when at least one count is non-zero — otherwise every healthy
  // answer would tell the reviewer "0 connections not reporting" and that
  // totals "may be incomplete because of these."
  const quality = snapshot.financialSummary?.quality;
  if (quality) {
    const connectionGaps = countConnectionGaps(quality);
    const staleCount = quality.staleSourceIds?.length ?? 0;
    const errorCount = quality.errors?.length ?? 0;
    const qualityParts = [
      ...(connectionGaps > 0 ? [`${connectionGaps} account connection(s) not reporting`] : []),
      ...(staleCount > 0 ? [`${staleCount} stale source(s)`] : []),
      ...(errorCount > 0 ? [`${errorCount} source error(s)`] : []),
    ];
    if (qualityParts.length > 0) {
      parts.push(
        `Data quality (the totals above may be incomplete because of these): ${qualityParts.join(', ')}`
      );
    }
  }

  const overview = snapshot.financialSummary?.financialOverview;
  if (overview) {
    parts.push(
      `Financial overview: netWorth=${overview.netWorth}, totalCash=${overview.totalCash}, totalInvestments=${overview.totalInvestments}, totalDebt=${overview.totalDebt}, homeValue=${overview.homeValue ?? 'null'}`
    );
  }

  const invPortfolio = snapshot.financialSummary?.investmentPortfolio;
  const invSnapshot = snapshot.investments;
  if (invPortfolio) {
    parts.push(
      `Investment portfolio: totalValue=${invPortfolio.totalValue}, holdingsCount=${invPortfolio.holdingsCount}`
    );
    const allocation = mergeAssetAllocation(invPortfolio.assetAllocation);
    if (allocation.length) {
      parts.push(
        `Asset allocation: ${allocation.map((a) => `${a.type}=${a.value} (${a.percentage}%)`).join(', ')}`
      );
    }
  }
  if (invSnapshot?.holdings?.length) {
    const holdingNames = invSnapshot.holdings
      .slice(0, 50)
      .map((h: { security_name?: string; ticker_symbol?: string }) => h.security_name || h.ticker_symbol || 'unknown')
      .filter(Boolean);
    parts.push(`Holdings (sample): ${holdingNames.join(', ')}`);
  }

  const ra = snapshot.retirementAnalysis;
  if (ra?._storedInputParams) {
    const p = ra._storedInputParams;
    parts.push(
      `Retirement params: currentAge=${p.currentAge}, retirementAge=${p.retirementAge}, annualWithdrawalAmount=${p.annualWithdrawalAmount}, withdrawalStartAge=${p.withdrawalStartAge}`
    );
  }
  if (ra?.stressTest) {
    const st = ra.stressTest;
    const survivalPct = formatMetricPercent(st.survivalRate, 1);
    parts.push(
      `Stress test (historical sequences): totalSequences=${st.totalSequences}, survivalRate=${survivalPct}`
    );
    if (st.depletionPercentiles) {
      const dp = st.depletionPercentiles;
      const pParts: string[] = [];
      if (dp.p10 != null) pParts.push(`p10=${dp.p10}y`);
      if (dp.p25 != null) pParts.push(`p25=${dp.p25}y`);
      if (dp.p50 != null) pParts.push(`p50=${dp.p50}y`);
      if (dp.p75 != null) pParts.push(`p75=${dp.p75}y`);
      if (dp.p90 != null) pParts.push(`p90=${dp.p90}y`);
      if (pParts.length) parts.push(`Depletion percentiles (years until depletion): ${pParts.join(', ')}`);
    }
    if (st.survivalRate >= 1) {
      parts.push(`Worst depletion sequences: N/A (all sequences survived)`);
    } else if (st.worstSequences?.byDepletion?.length) {
      const top = st.worstSequences.byDepletion.slice(0, 3).map((s) => `${s.sequenceId}:${s.yearsUntilDepletion}y`).join(', ');
      parts.push(`Worst depletion sequences (sample): ${top}`);
    }
  }
  if (ra?.metrics) {
    const m = ra.metrics;
    const num = (v: unknown, digits = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : 'N/A');
    parts.push(
      `Retirement metrics: withdrawalRate=${formatMetricPercent(m.withdrawalRate)}, yearsOfExpenses=${num(m.yearsOfExpenses)}, equityAllocation=${typeof m.equityAllocation === 'number' && Number.isFinite(m.equityAllocation) ? m.equityAllocation.toFixed(1) + '%' : 'N/A'}`
    );
    if (m.historicalWithdrawalRates) {
      const hwr = m.historicalWithdrawalRates;
      parts.push(
        `Estimated withdrawal rates (heuristic percentiles): p10=${formatMetricPercent(hwr.p10)}, p25=${formatMetricPercent(hwr.p25)}, p50=${formatMetricPercent(hwr.p50)}, p75=${formatMetricPercent(hwr.p75)}, p90=${formatMetricPercent(hwr.p90)}`
      );
    }
  }

  if (snapshot.incomeAnalysis) {
    parts.push(`Income analysis: ${snapshot.incomeAnalysis.slice(0, 200)}`);
  }
  if (snapshot.expenseAnalysis) {
    parts.push(`Expense analysis: ${snapshot.expenseAnalysis.slice(0, 200)}`);
  }
  if (snapshot.monthlyCashFlowAnalysis) {
    parts.push(`Monthly cash flow: ${snapshot.monthlyCashFlowAnalysis.slice(0, 1_000)}`);
  }

  return parts.length > 0 ? parts.join('\n') : '(no snapshot data)';
}

/**
 * Validate an Ask Linc response using Gemini.
 */
export async function validateWithGemini(
  response: AskLincResponse,
  context: { question: string; snapshot: FinancialContextSnapshot }
): Promise<ValidationResult> {
  if (!GOOGLE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    return { valid: true };
  }

  try {
    const client = getClient();
    // Until these settings existed the review ran on Gemini's own defaults with
    // no generationConfig at all, so both ship as `off` and nothing is sent
    // unless an admin asks for it.
    const temperature = getActiveNumericGenerationSetting('validation', 'temperature');
    const maxOutputTokens = getActiveNumericGenerationSetting('validation', 'maxOutputTokens');
    const generationConfig = {
      ...(temperature === null ? {} : { temperature }),
      ...(maxOutputTokens === null ? {} : { maxOutputTokens }),
    };

    const model = client.getGenerativeModel({
      model: getActiveModel('validation'),
      ...(Object.keys(generationConfig).length === 0 ? {} : { generationConfig }),
    });

    const snapshotSummary = buildSnapshotSummaryForValidation(context.snapshot);
    console.log('Ask Linc: Gemini validation prompt includes snapshot summary, length:', snapshotSummary.length);

    const prompt = `${VALIDATION_PROMPT}

## User Question
${context.question}

## Financial Context (available to the model)
${snapshotSummary}

## Response to Validate
${JSON.stringify(response, null, 2)}

Respond with only the JSON object, no other text.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        valid: parsed.valid === true,
        issues: Array.isArray(parsed.issues) ? parsed.issues : undefined,
        promptSent: prompt,
        rawResponse: text
      };
    }

    return { valid: true, promptSent: prompt, rawResponse: text };
  } catch (err) {
    console.warn('Gemini validation failed:', err);
    return { valid: true };
  }
}
