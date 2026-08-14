/**
 * Types for "Show the Math" transparency feature.
 * Captures pipeline data (Claude, Gemini) and relevant DB records.
 */

export interface ShowTheMathDatabaseData {
  /** Exact canonical projection supplied to the analysis, captured before later refreshes can replace it. */
  analysis_context_snapshot?: unknown;
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
  geminiRetryValidation?: ShowTheMathGeminiValidation;
  databaseData: ShowTheMathDatabaseData;
}
