/**
 * Types for "Show the Math" transparency feature.
 * Captures pipeline data (Claude, Gemini) and relevant DB records.
 */

export interface ShowTheMathDatabaseData {
  asset_price_history?: unknown[];
  financial_summaries?: unknown;
  financial_summary_snapshots?: unknown;
  retirement_analyses?: unknown[];
  security_metadata?: unknown[];
  market_news_context?: unknown;
  market_news_history?: unknown[];
}

export interface ShowTheMathClaudeCall {
  systemPrompt: string;
  userMessage: string;
  rawResponse: string;
}

export interface ShowTheMathGeminiValidation {
  prompt: string;
  rawResponse: string;
  parsedResult: { valid: boolean; issues?: string[] };
}

export interface ShowTheMathData {
  claudeFirstCall: ShowTheMathClaudeCall;
  geminiValidation?: ShowTheMathGeminiValidation;
  claudeRetry?: ShowTheMathClaudeCall;
  databaseData: ShowTheMathDatabaseData;
}
