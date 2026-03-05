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
const DEFAULT_MODEL = 'gemini-1.5-flash';

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
2. The financial analysis response (with summary, key_numbers, insights, suggested_actions)

Check for:
- Calculation consistency: Do the key_numbers align with the summary and insights?
- Logical reasoning: Are the conclusions supported by the data?
- Unsupported assumptions: Does the response invent data not present in the context?
- Formula errors: Are any financial formulas (e.g., 4% rule, debt-to-income) applied correctly?

Respond with a JSON object:
- If valid: { "valid": true }
- If invalid: { "valid": false, "issues": ["issue 1", "issue 2", ...] }

Be strict but fair. Only flag real problems.`;

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

    const prompt = `${VALIDATION_PROMPT}

## User Question
${context.question}

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
