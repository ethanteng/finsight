/**
 * Input validation for user prompts before sending to LLM.
 * Rejects malicious, security-sensitive, and off-topic prompts.
 */

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

/** Financial relevance signals - if present, allow even with some off-topic words */
const FINANCIAL_SIGNALS = [
  'balance', 'spend', 'invest', 'save', 'budget', 'debt', 'income', 'expense',
  'portfolio', 'retirement', 'mortgage', 'account', 'transaction', 'net worth',
  'savings', 'spending', 'cash', 'credit', 'loan', 'payment', 'bill', 'tax',
  'financial', 'money', 'dollar', 'asset', 'stock', 'bond', 'fund', '401k',
  'ira', 'roth', 'hsa', 'cd ', 'rate', 'apr', 'interest', 'dividend', 'return',
  'allocation', 'holding', 'withdraw', 'deposit', 'fee', 'cost', 'price',
  'worth', 'value', 'wealth', 'goal', 'planning', 'advisor', 'linc'
];

/** Security patterns - instruction override, jailbreak, etc. */
const INSTRUCTION_OVERRIDE_PATTERNS = [
  /ignore\s+(previous|all)\s+(instructions?|above|prior)/i,
  /disregard\s+(all\s+)?(instructions?|above|prior)/i,
  /forget\s+(all\s+)?(instructions?|above|prior)/i,
  /override\s+(all\s+)?(instructions?|safeguards?)/i,
  /bypass\s+(safeguards?|restrictions?|safety)/i,
  /act\s+as\s+(system|admin|root|developer)/i,
  /new\s+instructions?/i,
  /pretend\s+you\s+are/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /from\s+now\s+on\s+you/i,
];

const SECRETS_REQUEST_PATTERNS = [
  /api[_\s]*key/i,
  /credentials?/i,
  /\bpassword\b/i,
  /\bsecret\s*(key|token)?\b/i,
  /\bjwt\b/i,
  /\bbearer\s+token/i,
  /database\s+dump/i,
  /dump\s+(the\s+)?database/i,
  /env(ironment)?\s*variable/i,
  /process\.env/i,
  /(show|give|tell|reveal)\s+(me\s+)?(your|the)\s+(api|key|credential|token|secret)/i,
];

const ACCESS_REQUEST_PATTERNS = [
  /read\s+(the\s+)?file/i,
  /list\s+(the\s+)?(directory|files)/i,
  /filesystem/i,
  /execute\s+(\w+\s+)?(code|command)/i,
  /run\s+(the\s+)?(code|command)/i,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /act\s+as\s+root/i,
  /\bsudo\b/i,
  /admin\s+access/i,
];

const JAILBREAK_PATTERNS = [
  /dan\s+mode/i,
  /\bjailbreak\b/i,
  /developer\s+mode/i,
  /no\s+restrictions?/i,
  /without\s+limitations?/i,
];

const SYSTEM_PROMPT_PATTERNS = [
  /show\s+(me\s+)?(your\s+)?system\s+prompt/i,
  /reveal\s+(your\s+)?instructions?/i,
  /what\s+are\s+your\s+rules/i,
  /repeat\s+(your\s+)?prompt/i,
  /print\s+(your\s+)?(system\s+)?prompt/i,
  /output\s+(your\s+)?instructions?/i,
];

/** Off-topic patterns - only reject if NO financial signals present */
const OFF_TOPIC_PATTERNS = [
  /\bweather\b/i,
  /\btemperature\b/i,
  /\bforecast\b/i,
  /\brain\b/i,
  /\bsnow\b/i,
  /\bwho\s+(is|won)\s+/i,
  /\bcapital\s+of\s+/i,
  /\bhow\s+to\s+cook\b/i,
  /\bsports\s+score\b/i,
  /\brecipe\b/i,
  /\bhow\s+do\s+I\s+make\b/i,
  /\bmake\s+(pasta|pizza|cake)\b/i,
  /\bmovie\b/i,
  /\bsong\b/i,
  /\bgame\b.*\b(play|win)\b/i,
  /\bdebug\s+(my\s+)?code\b/i,
  /\bfix\s+(this\s+)?bug\b/i,
  /\btranslate\s+(this|to)\b/i,
  /\bmedical\s+advice\b/i,
  /\blegal\s+advice\b/i,
  /\brelationship\s+advice\b/i,
];

function hasFinancialSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return FINANCIAL_SIGNALS.some(signal => lower.includes(signal));
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

/**
 * Validate a single input string against security and topic rules.
 */
function validateSingleInput(input: string): ValidationResult {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { allowed: false, reason: 'empty_input' };
  }

  const normalized = trimmed.toLowerCase();

  // 1. Security patterns (always reject)
  if (matchesAny(normalized, INSTRUCTION_OVERRIDE_PATTERNS)) {
    return { allowed: false, reason: 'instruction_override' };
  }
  if (matchesAny(normalized, SECRETS_REQUEST_PATTERNS)) {
    return { allowed: false, reason: 'secrets_request' };
  }
  if (matchesAny(normalized, ACCESS_REQUEST_PATTERNS)) {
    return { allowed: false, reason: 'access_request' };
  }
  if (matchesAny(normalized, JAILBREAK_PATTERNS)) {
    return { allowed: false, reason: 'jailbreak' };
  }
  if (matchesAny(normalized, SYSTEM_PROMPT_PATTERNS)) {
    return { allowed: false, reason: 'system_prompt_extraction' };
  }

  // 2. Topic relevance - only reject if off-topic AND no financial signal
  if (matchesAny(normalized, OFF_TOPIC_PATTERNS) && !hasFinancialSignal(normalized)) {
    return { allowed: false, reason: 'off_topic' };
  }

  return { allowed: true };
}

/**
 * Validate user prompt before sending to LLM.
 * Also validates each question in conversation history to catch injection in prior messages.
 *
 * @param input - The current user question
 * @param conversationHistory - Optional prior Q&A pairs (only questions are validated)
 * @returns { allowed: boolean, reason?: string }
 */
export function validateUserPrompt(
  input: string,
  conversationHistory?: { question: string }[]
): ValidationResult {
  // Validate current question
  const currentResult = validateSingleInput(input);
  if (!currentResult.allowed) {
    return currentResult;
  }

  // Validate each prior question in history (injection can hide there)
  if (conversationHistory && conversationHistory.length > 0) {
    for (const conv of conversationHistory) {
      const q = conv?.question;
      if (typeof q === 'string') {
        const histResult = validateSingleInput(q);
        if (!histResult.allowed) {
          return histResult;
        }
      }
    }
  }

  return { allowed: true };
}

/**
 * User-friendly error message for rejected prompts.
 * Use when reason is known to return a safe, non-revealing response.
 */
export function getRejectionMessage(reason?: string): string {
  switch (reason) {
    case 'off_topic':
      return "I'm Linc, and I stick to money stuff — things like your accounts, spending, investments, and financial goals. Ask me about any of those and I'm happy to help!";
    case 'instruction_override':
    case 'secrets_request':
    case 'access_request':
    case 'jailbreak':
    case 'system_prompt_extraction':
    default:
      return "Sorry, I can't help with that one — but I'm here whenever you have a financial question.";
  }
}
