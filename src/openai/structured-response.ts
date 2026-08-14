/**
 * Structured Response Schema and Parser
 *
 * Ask Linc returns a structured JSON response. This module defines the schema
 * and parses LLM output (JSON block or markdown) into the structure.
 */

import type { CanonicalFactUnit } from './canonical-facts';

export interface ResponseKeyNumber {
  value: number;
  unit: CanonicalFactUnit;
  /** Canonical fact ID. The server verifies and normalizes this before display. */
  provenance: string;
}

export interface AskLincResponse {
  summary: string;
  /** Numeric form is accepted only for legacy stored responses; the Step 7 pipeline emits typed values. */
  key_numbers?: Record<string, ResponseKeyNumber | number>;
  insights?: string[];
  suggested_actions?: string[];
}

/** Provider-agnostic contract used in prompts and by providers that support JSON Schema. */
export const ASK_LINC_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    key_numbers: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          value: { type: 'number' },
          unit: { type: 'string', enum: ['usd', 'percent', 'months', 'years', 'age', 'count', 'ratio'] },
          provenance: { type: 'string' },
        },
        required: ['value', 'unit', 'provenance'],
      },
    },
    insights: { type: 'array', items: { type: 'string' } },
    suggested_actions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'key_numbers', 'insights', 'suggested_actions'],
} as const;

/**
 * Extract the (possibly incomplete) decoded value of the top-level "summary"
 * field from a partial JSON string as it streams in. Returns the decoded prefix
 * of the summary so far, or '' if the summary string hasn't started yet.
 *
 * Used to progressively surface the human-readable answer over SSE while the
 * model is still producing the full structured JSON response. It tolerates
 * unterminated strings and incomplete escape sequences at the truncation point.
 */
export function extractPartialSummary(raw: string): string {
  if (!raw) return '';
  const keyIdx = raw.indexOf('"summary"');
  if (keyIdx === -1) return '';

  let i = raw.indexOf(':', keyIdx + '"summary"'.length);
  if (i === -1) return '';
  i++;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (i >= raw.length || raw[i] !== '"') return '';
  i++; // past opening quote

  let out = '';
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') {
      if (i + 1 >= raw.length) break; // incomplete escape — stop here
      const next = raw[i + 1];
      switch (next) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'u': {
          if (i + 6 > raw.length) { i = raw.length; break; } // incomplete \uXXXX
          const code = parseInt(raw.slice(i + 2, i + 6), 16);
          if (!Number.isNaN(code)) out += String.fromCharCode(code);
          i += 4;
          break;
        }
        default: out += next; break;
      }
      i += 2;
    } else if (ch === '"') {
      break; // closing quote — summary complete
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/**
 * Parse LLM output to extract structured JSON response.
 * Handles: raw JSON, JSON in markdown code block, malformed/truncated JSON, duplicate keys.
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

  // Try to find JSON object (from first { to last })
  const jsonObjectMatch = trimmed.match(/\{[\s\S]*"summary"[\s\S]*\}/);
  if (jsonObjectMatch) {
    const parsed = tryParseJson(jsonObjectMatch[0]);
    if (parsed) return parsed;
  }

  // Try parsing the whole string as JSON
  const parsed = tryParseJson(trimmed);
  if (parsed) return parsed;

  // Try repaired JSON (fix truncation, remove duplicate keys)
  const repaired = repairMalformedJson(trimmed);
  if (repaired) {
    const parsed = tryParseJson(repaired);
    if (parsed) return parsed;
  }

  // Fallback: extract fields with regex when parse fails
  const extracted = extractFieldsFromMalformedJson(trimmed);
  if (extracted) return extracted;

  // Last resort: wrap raw text in summary
  return {
    summary: trimmed,
    insights: [],
    suggested_actions: []
  };
}

/**
 * Attempt to repair malformed JSON: truncation, unclosed strings/arrays.
 * Handles duplicate keys by extracting first occurrence via regex before parse.
 */
function repairMalformedJson(str: string): string | null {
  const start = str.indexOf('{');
  if (start === -1) return null;

  let json = str.slice(start);
  // Remove duplicate keys: keep first occurrence of each key
  json = deduplicateJsonKeys(json);
  // Close unclosed brackets/braces
  const openBraces = (json.match(/{/g) || []).length - (json.match(/}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length - (json.match(/]/g) || []).length;
  json += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
  return json;
}

/**
 * Remove duplicate JSON keys by keeping the first occurrence of each.
 * Handles malformed output like "insights":[...],"insights":[...]
 */
function deduplicateJsonKeys(json: string): string {
  const keys = ['summary', 'key_numbers', 'insights', 'suggested_actions'];
  const parts: string[] = [];
  for (const key of keys) {
    const idx = json.indexOf(`"${key}"`);
    if (idx === -1) continue;
    const valueStart = json.indexOf(':', idx) + 1;
    const value = extractJsonValue(json, valueStart);
    if (value !== null) {
      parts.push(`"${key}": ${value}`);
    }
  }
  if (parts.length > 0) {
    return '{' + parts.join(', ') + '}';
  }
  return json;
}

/** Extract a complete JSON value (string, number, object, array) starting at pos. */
function extractJsonValue(str: string, pos: number): string | null {
  const s = str.slice(pos).replace(/^\s+/, '');
  if (s.startsWith('"')) {
    let i = 1;
    while (i < s.length) {
      if (s[i] === '\\') i += 2;
      else if (s[i] === '"') return s.slice(0, i + 1);
      else i++;
    }
    return s + '"';
  }
  if (s.startsWith('{')) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') {
        depth--;
        if (depth === 0) return s.slice(0, i + 1);
      }
    }
    return s + '}'.repeat(depth);
  }
  if (s.startsWith('[')) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '[') depth++;
      else if (s[i] === ']') {
        depth--;
        if (depth === 0) return s.slice(0, i + 1);
      }
    }
    return s + ']'.repeat(depth);
  }
  const comma = s.search(/,\s*"/);
  const brace = s.indexOf('}');
  const end = comma === -1 ? (brace === -1 ? s.length : brace) : Math.min(comma, brace === -1 ? s.length : brace);
  return s.slice(0, end).trim() || null;
}

/**
 * Extract fields from malformed JSON using regex when parse fails.
 * Focus on the JSON object (from last { before "summary" to end).
 */
function extractFieldsFromMalformedJson(str: string): AskLincResponse | null {
  const jsonStart = str.lastIndexOf('{');
  const jsonSection = jsonStart >= 0 ? str.slice(jsonStart) : str;

  const summaryMatch = jsonSection.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const summary = summaryMatch ? summaryMatch[1].replace(/\\"/g, '"') : '';

  let key_numbers: Record<string, ResponseKeyNumber> | undefined;
  const keyNumbersMatch = jsonSection.match(/"key_numbers"\s*:\s*(\{[^}]*\})/);
  if (keyNumbersMatch) {
    try {
      const parsed = JSON.parse(keyNumbersMatch[1]);
      if (parsed && typeof parsed === 'object') {
        key_numbers = {};
        for (const [k, v] of Object.entries(parsed)) {
          const num = typeof v === 'number' ? v : parseFloat(String(v));
          if (!Number.isNaN(num)) {
            key_numbers[k] = { value: num, unit: inferKeyNumberUnit(k), provenance: '' };
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const insightsMatch = jsonSection.match(/"insights"\s*:\s*\[([\s\S]*?)\]/) ||
    jsonSection.match(/"insights"\s*:\s*\[([\s\S]*)/);
  const insights = insightsMatch ? parseJsonArrayItems(insightsMatch[1]) : [];

  const actionsMatch = jsonSection.match(/"suggested_actions"\s*:\s*\[([\s\S]*?)\]/) ||
    jsonSection.match(/"suggested_actions"\s*:\s*\[([\s\S]*)/);
  const suggested_actions = actionsMatch ? parseJsonArrayItems(actionsMatch[1]) : [];

  if (summary || insights.length > 0 || suggested_actions.length > 0) {
    return {
      summary: summary || 'No summary provided.',
      key_numbers: key_numbers && Object.keys(key_numbers).length > 0 ? key_numbers : undefined,
      insights: insights.length > 0 ? insights : undefined,
      suggested_actions: suggested_actions.length > 0 ? suggested_actions : undefined
    };
  }
  return null;
}

function parseJsonArrayItems(arrContent: string): string[] {
  const items: string[] = [];
  const regex =/"((?:[^"\\]|\\.)*)"|'([^']*)'/g;
  let m;
  while ((m = regex.exec(arrContent)) !== null) {
    items.push((m[1] || m[2] || '').replace(/\\"/g, '"'));
  }
  return items.filter(Boolean);
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
  const key_numbers: Record<string, ResponseKeyNumber> = {};
  if (obj.key_numbers && typeof obj.key_numbers === 'object' && !Array.isArray(obj.key_numbers)) {
    for (const [k, v] of Object.entries(obj.key_numbers)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const raw = v as Record<string, unknown>;
        const value = typeof raw.value === 'number' ? raw.value : Number.parseFloat(String(raw.value));
        const unit = isCanonicalFactUnit(raw.unit) ? raw.unit : inferKeyNumberUnit(k);
        const provenance = typeof raw.provenance === 'string' ? raw.provenance : '';
        if (Number.isFinite(value)) key_numbers[k] = { value, unit, provenance };
      } else {
        const value = typeof v === 'number' ? v : Number.parseFloat(String(v));
        if (Number.isFinite(value)) {
          key_numbers[k] = { value, unit: inferKeyNumberUnit(k), provenance: '' };
        }
      }
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

function isPercentageKey(keyLower: string): boolean {
  const tokens = keyLower.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => ['percent', 'pct', 'rate', 'allocation', 'apy'].includes(token));
}

function isCanonicalFactUnit(value: unknown): value is CanonicalFactUnit {
  return value === 'usd' || value === 'percent' || value === 'years' ||
    value === 'months' || value === 'age' || value === 'count' || value === 'ratio';
}

export function inferKeyNumberUnit(key: string): CanonicalFactUnit {
  const keyLower = key.toLowerCase();
  const tokens = keyLower.split(/[^a-z0-9]+/).filter(Boolean);
  if (isPercentageKey(keyLower)) return 'percent';
  if (tokens.some((token) => token === 'month' || token === 'months')) return 'months';
  if (tokens.some((token) => token === 'year' || token === 'years')) return 'years';
  if (tokens.includes('age')) return 'age';
  if (tokens.includes('count')) return 'count';
  if (tokens.includes('ratio')) return 'ratio';
  return 'usd';
}

/** Format a numeric value as a USD amount rounded to the nearest dollar. */
function formatDollars(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString()}`;
}

/**
 * Format a key_number value for display based on the key name.
 *
 * Precedence (most specific → least specific):
 * 1. Percentage keys ("percent", "pct", "rate", "allocation", "apy") → percentage, e.g. 4.15%.
 *    Checked FIRST so keys like "unrealized_loss_percent" or "loss_rate" render as
 *    percentages rather than dollars.
 * 2. Time keys ("months", "years") → plain number, e.g. 28.
 * 3. Dollar keys ("loss", "surplus", "buffer", "dollars") → dollar amount, e.g. $187,547.
 * 4. Default → dollar amount.
 *
 * Percentages are expected in whole-number form (e.g. 4.15 for 4.15%). Values
 * are displayed exactly; grounding validation handles implausible model output.
 */
export function formatKeyNumberValue(key: string, metric: number | ResponseKeyNumber): string {
  const value = typeof metric === 'number' ? metric : metric.value;
  const unit = typeof metric === 'number' ? inferKeyNumberUnit(key) : metric.unit;
  if (unit === 'percent') {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  }
  if (unit === 'months' || unit === 'years' || unit === 'age' || unit === 'count' || unit === 'ratio') {
    return value.toLocaleString();
  }
  // Remaining keys (including "loss", "surplus", "buffer", "dollars") are dollar amounts.
  return formatDollars(value);
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
      const formatted = formatKeyNumberValue(k, v);
      parts.push(`- ${label}: ${formatted}`);
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
