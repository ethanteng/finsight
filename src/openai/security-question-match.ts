/**
 * Shared matcher for "does this question name this security?".
 *
 * Used to decide whether a holding's own rows — per-fund country/sector
 * vectors, individual holding values — belong in the prompt, or whether only
 * the portfolio-level aggregates do. Both callers previously inlined this.
 */

const MIN_MATCHABLE_NAME_LENGTH = 4;

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary ticker match: "SPY" matches "how is SPY doing", not "SPYDER". */
export function questionMentionsTicker(question: string, ticker?: string): boolean {
  const trimmed = ticker?.trim();
  if (!trimmed) return false;
  return new RegExp(`\\b${escapeForRegExp(trimmed)}\\b`, 'i').test(question);
}

/**
 * Security names are free text from the broker, so a bare `includes` lets a
 * short or common name ("Cash", "Fund") match nearly any question. Require a
 * few characters and a word boundary on each end.
 */
export function questionMentionsSecurityName(question: string, name?: string): boolean {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.length < MIN_MATCHABLE_NAME_LENGTH) return false;
  return new RegExp(`\\b${escapeForRegExp(trimmed)}\\b`, 'i').test(question);
}

export function questionMentionsSecurity(question: string, ticker?: string, name?: string): boolean {
  return questionMentionsTicker(question, ticker) || questionMentionsSecurityName(question, name);
}
