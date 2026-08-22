/**
 * Telling a holding's *name* apart from its *identifier*.
 *
 * The portfolio mapper labels a holding by security name, then the holding's
 * own name, then ticker, and finally the provider's security id:
 *
 *   security?.name || holding.security_name || ticker || holding.security_id
 *
 * That last fallback is reached only when a provider returned nothing readable,
 * and it is disproportionately the securities that fail classification which
 * land there -- the same absent metadata causes both. So the labels that most
 * need to be legible are the ones most likely not to be.
 *
 * Two consumers need to know which case they are holding, and they need to
 * agree. The admin data-gap report resolves identifiers back to names; the
 * data-quality report has to avoid handing a raw id to a model that will then
 * present it to someone as though it were a fund. A predicate duplicated
 * between them would drift, so it lives here, depending on nothing.
 */

/**
 * Does this label look like a provider identifier rather than a name?
 *
 * Shape-based on purpose: the question is whether a *string* is readable, which
 * has to be answerable for ids from providers this code has never seen. The
 * observed forms are Plaid's long mixed-case ids
 * (`7dD8KV8owvUX4bDwnDNPcLPy8Kyr9dFzwg9RN`) and institutional forms such as
 * `SPUSA061004C00000000`.
 *
 * Three conditions, each earning its place:
 *  - no whitespace, because provider names are spaced ("State St Target Ret
 *    2025 SL SF CL III") and identifiers are not;
 *  - at least 12 characters, so tickers (`VTI`, `VFIAX`) are never mistaken for
 *    identifiers -- a ticker is terse but a person reads it;
 *  - at least one digit, so a run-together name would have to also carry a
 *    number before it could be misread as an id.
 *
 * Being wrong in the false-negative direction is the cheap failure: an id that
 * slips through reads as it does today. A false positive would hide a real
 * name, so the test is deliberately narrow.
 */
export function isProviderIdentifierLabel(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed.length < 12) return false;
  if (/\s/.test(trimmed)) return false;
  if (!/\d/.test(trimmed)) return false;
  return /^[A-Za-z0-9._:-]+$/.test(trimmed);
}

/**
 * How an unnamed holding should be described in prose meant for a person.
 *
 * The identifier is kept rather than dropped: it is the only handle anyone has
 * for chasing the security with the provider. But it is placed after a phrase
 * that says what it is, so neither a reader nor a model mistakes the hex for a
 * fund name. Labels that are already names pass through untouched.
 */
export function describeHoldingForProse(label: string): string {
  return isProviderIdentifierLabel(label) ? `Unidentified holding (${label.trim()})` : label;
}
