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

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const DEFAULT_MODEL = process.env.GEMINI_VALIDATION_MODEL || 'gemini-3-flash-preview';

export interface ValidationResult {
  valid: boolean;
  issues?: string[];
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
- Unsupported assumptions: Does the response invent data NOT present in the financial context? (If the snapshot contains portfolio value, holdings, withdrawal amounts, etc., the response may use them—do NOT flag as invented.)
- Formula errors: Are any financial formulas (e.g., 4% rule, debt-to-income) applied correctly?

Respond with a JSON object:
- If valid: { "valid": true }
- If invalid: { "valid": false, "issues": ["issue 1", "issue 2", ...] }

Be strict but fair. Only flag real problems.`;

/**
 * Build a compact summary of the financial snapshot for validation.
 * Gives Gemini enough context to know what data was available to Claude.
 */
function buildSnapshotSummaryForValidation(snapshot: FinancialContextSnapshot): string {
  const parts: string[] = [];

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
    if (invPortfolio.assetAllocation?.length) {
      parts.push(
        `Asset allocation: ${invPortfolio.assetAllocation.map((a) => `${a.type}=${a.value} (${a.percentage}%)`).join(', ')}`
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
    parts.push(
      `Stress test: survivalRate=${ra.stressTest.survivalRate}, totalSequences=${ra.stressTest.totalSequences}`
    );
  }
  if (ra?.metrics) {
    parts.push(
      `Retirement metrics: withdrawalRate=${ra.metrics.withdrawalRate}, yearsOfExpenses=${ra.metrics.yearsOfExpenses}, equityAllocation=${ra.metrics.equityAllocation}`
    );
  }

  if (snapshot.incomeAnalysis) {
    parts.push(`Income analysis: ${snapshot.incomeAnalysis.slice(0, 200)}`);
  }
  if (snapshot.expenseAnalysis) {
    parts.push(`Expense analysis: ${snapshot.expenseAnalysis.slice(0, 200)}`);
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
    const model = client.getGenerativeModel({ model: DEFAULT_MODEL });

    const snapshotSummary = buildSnapshotSummaryForValidation(context.snapshot);

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
        issues: Array.isArray(parsed.issues) ? parsed.issues : undefined
      };
    }

    return { valid: true };
  } catch (err) {
    console.warn('Gemini validation failed:', err);
    return { valid: true };
  }
}
