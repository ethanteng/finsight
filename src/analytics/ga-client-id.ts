/**
 * A GA4 client id is two dot-separated integers, e.g. "1234567890.1700000000".
 *
 * Shared by the payment-success route, which accepts one from the browser, and
 * the Measurement Protocol sender, which refuses to report a conversion without
 * one. Values arrive from a query string, so they are validated rather than
 * trusted: anything else would be written onto a Stripe subscription and later
 * replayed to GA4.
 */
export function isGaClientId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+$/.test(value);
}
