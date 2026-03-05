/**
 * Structured Response Schema and Parser
 *
 * Ask Linc returns a structured JSON response. This module defines the schema
 * and parses LLM output (JSON block or markdown) into the structure.
 */

export interface AskLincResponse {
  summary: string;
  key_numbers?: Record<string, number>;
  insights?: string[];
  suggested_actions?: string[];
}

/**
 * Parse LLM output to extract structured JSON response.
 * Handles: raw JSON, JSON in markdown code block, or plain text fallback.
 */
export function parseStructuredResponse(llmOutput: string): AskLincResponse {
  if (!llmOutput || typeof llmOutput !== 'string') {
    return { summary: 'No response generated.' };
  }

  const trimmed = llmOutput.trim();

  // Try to extract JSON from markdown code block (```json ... ```)
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    const parsed = tryParseJson(jsonBlockMatch[1].trim());
    if (parsed) return parsed;
  }

  // Try to find JSON object at end of response (common LLM pattern)
  const jsonObjectMatch = trimmed.match(/\{[\s\S]*"summary"[\s\S]*\}/);
  if (jsonObjectMatch) {
    const parsed = tryParseJson(jsonObjectMatch[0]);
    if (parsed) return parsed;
  }

  // Try parsing the whole string as JSON
  const parsed = tryParseJson(trimmed);
  if (parsed) return parsed;

  // Fallback: wrap raw text in summary
  return {
    summary: trimmed,
    insights: [],
    suggested_actions: []
  };
}

function tryParseJson(str: string): AskLincResponse | null {
  try {
    const obj = JSON.parse(str);
    if (obj && typeof obj === 'object') {
      return normalizeResponse(obj);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function normalizeResponse(obj: Record<string, unknown>): AskLincResponse {
  const summary = typeof obj.summary === 'string' ? obj.summary : String(obj.summary ?? '');
  const key_numbers: Record<string, number> = {};
  if (obj.key_numbers && typeof obj.key_numbers === 'object' && !Array.isArray(obj.key_numbers)) {
    for (const [k, v] of Object.entries(obj.key_numbers)) {
      const num = typeof v === 'number' ? v : parseFloat(String(v));
      if (!Number.isNaN(num)) key_numbers[k] = num;
    }
  }
  const insights = Array.isArray(obj.insights)
    ? obj.insights.filter((x): x is string => typeof x === 'string')
    : [];
  const suggested_actions = Array.isArray(obj.suggested_actions)
    ? obj.suggested_actions.filter((x): x is string => typeof x === 'string')
    : [];

  return {
    summary: summary || 'No summary provided.',
    key_numbers: Object.keys(key_numbers).length > 0 ? key_numbers : undefined,
    insights: insights.length > 0 ? insights : undefined,
    suggested_actions: suggested_actions.length > 0 ? suggested_actions : undefined
  };
}

/**
 * Convert structured response to display text for backward compatibility.
 */
export function toDisplayText(response: AskLincResponse): string {
  const parts: string[] = [response.summary];

  if (response.key_numbers && Object.keys(response.key_numbers).length > 0) {
    parts.push('\n\n**Key Numbers:**');
    for (const [k, v] of Object.entries(response.key_numbers)) {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      parts.push(`- ${label}: $${typeof v === 'number' ? v.toLocaleString() : v}`);
    }
  }

  if (response.insights && response.insights.length > 0) {
    parts.push('\n\n**Insights:**');
    response.insights.forEach(i => parts.push(`- ${i}`));
  }

  if (response.suggested_actions && response.suggested_actions.length > 0) {
    parts.push('\n\n**Suggested Actions:**');
    response.suggested_actions.forEach(a => parts.push(`- ${a}`));
  }

  return parts.join('\n');
}
