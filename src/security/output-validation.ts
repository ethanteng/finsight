/**
 * Output validation for LLM responses before returning to user.
 * Detects and blocks leaked secrets, file paths, SQL, system prompt, etc.
 */

import {
  LINC_IDENTITY_PREFIX,
  NEVER_REVEAL_PREFIX,
  SECURITY_RULES_HEADING,
  UNTRUSTED_CONTENT_CLOSE,
  UNTRUSTED_CONTENT_OPEN,
} from './prompt-hardening';

export interface OutputValidationResult {
  safe: boolean;
  sanitized: string;
  flagged?: string;
}

const SAFE_FALLBACK = "I'm sorry, I cannot provide that information.";

/** API key patterns - avoid generic long strings to prevent false positives on IDs */
const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,  // OpenAI-style
  /api[_\s-]?key\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}/i,
];

/** Environment variable patterns */
const ENV_PATTERNS = [
  /process\.env\.\w+/,
  /DATABASE_URL\s*[:=]/i,
  /OPENAI_API_KEY\s*[:=]/i,
  /PLAID_\w+\s*[:=]/i,
  /SENTRY_DSN\s*[:=]/i,
  /STRIPE_\w+\s*[:=]/i,
];

/** JWT pattern */
const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+/;

/** File path patterns */
const FILE_PATH_PATTERNS = [
  /\/etc\/[^\s]+/,
  /\/home\/[^\s]+/,
  /\/var\/[^\s]+/,
  /[A-Z]:\\[^\s]+/,
  /~\/[^\s]+/,
  /\/Users\/[^\s]+/,
];

/** SQL dump patterns */
const SQL_PATTERNS = [
  /INSERT\s+INTO\s+/i,
  /SELECT\s+\*\s+FROM\s+/i,
  /DROP\s+TABLE\s+/i,
  /CREATE\s+TABLE\s+/i,
  /DELETE\s+FROM\s+/i,
];

/**
 * System prompt leakage - phrases that indicate our prompt was reproduced.
 *
 * Built from the same constants the prompt itself is assembled from. These
 * previously drifted: the detector went on matching a heading and an identity
 * line that had been reworded out of the prompt, so it could never fire.
 * Deriving the patterns means a reworded rule updates both sides at once, and
 * `prompt-hardening.test.ts` runs the live prompt through this validator so a
 * future rewording cannot quietly slip past it again.
 */
function leakagePatternFor(phrase: string): RegExp {
  // Whitespace in a reproduced prompt is the one thing a model reliably
  // reflows, so match on the words and let the spacing be anything.
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/\s+/g, '\\s+'), 'i');
}

const SYSTEM_PROMPT_LEAKAGE = [
  leakagePatternFor(SECURITY_RULES_HEADING),
  leakagePatternFor(LINC_IDENTITY_PREFIX),
  leakagePatternFor(NEVER_REVEAL_PREFIX),
  // The fence markers only exist inside the prompt. Seeing one in an answer
  // means either the prompt was reproduced or untrusted content is being
  // echoed back with its wrapper intact.
  leakagePatternFor(UNTRUSTED_CONTENT_OPEN),
  leakagePatternFor(UNTRUSTED_CONTENT_CLOSE),
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

/**
 * Validate LLM response before returning to user.
 * Detects secrets, file paths, SQL, system prompt leakage.
 * Returns sanitized fallback if any pattern is detected.
 *
 * @param output - Raw LLM response
 * @returns { safe: boolean, sanitized: string, flagged?: string }
 */
export function validateLLMResponse(output: string): OutputValidationResult {
  const trimmed = (output || '').trim();
  if (!trimmed) {
    return { safe: true, sanitized: trimmed };
  }

  // Check each category
  if (matchesAny(trimmed, API_KEY_PATTERNS)) {
    return { safe: false, sanitized: SAFE_FALLBACK, flagged: 'api_key_detected' };
  }
  if (matchesAny(trimmed, ENV_PATTERNS)) {
    return { safe: false, sanitized: SAFE_FALLBACK, flagged: 'env_var_detected' };
  }
  if (JWT_PATTERN.test(trimmed)) {
    return { safe: false, sanitized: SAFE_FALLBACK, flagged: 'jwt_detected' };
  }
  if (matchesAny(trimmed, FILE_PATH_PATTERNS)) {
    return { safe: false, sanitized: SAFE_FALLBACK, flagged: 'file_path_detected' };
  }
  if (matchesAny(trimmed, SQL_PATTERNS)) {
    return { safe: false, sanitized: SAFE_FALLBACK, flagged: 'sql_detected' };
  }
  if (matchesAny(trimmed, SYSTEM_PROMPT_LEAKAGE)) {
    return { safe: false, sanitized: SAFE_FALLBACK, flagged: 'system_prompt_leakage' };
  }

  return { safe: true, sanitized: trimmed };
}
