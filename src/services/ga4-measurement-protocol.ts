/**
 * Server-to-server GA4 delivery for conversions that happen with no browser.
 *
 * Every new customer gets a 30-day trial, so Checkout returns
 * `no_payment_required` and the success page correctly declines to call that a
 * purchase. The real conversion is the first invoice Stripe charges a month
 * later, inside a webhook — there is no `dataLayer` to push to there, so it can
 * only reach GA4 through the Measurement Protocol.
 *
 * Nothing here may break billing: every failure is logged and swallowed, and a
 * missing API secret disables sending rather than throwing. Losing an analytics
 * event is a reporting gap; a webhook that throws is a customer who paid and
 * did not get provisioned.
 */

const MEASUREMENT_PROTOCOL_URL = 'https://www.google-analytics.com/mp/collect';

/** How long to wait on Google before giving up and letting the webhook finish. */
const REQUEST_TIMEOUT_MS = 3000;

/** Total attempts per conversion. Worst case stays far inside Stripe's timeout. */
const MAX_ATTEMPTS = 2;

export interface Ga4PurchaseEvent {
  /** GA4 client id captured in the browser, e.g. "1234567890.1700000000". */
  clientId: string;
  /** Stable per-checkout id. GA4 dedupes purchases on this. */
  transactionId: string;
  /** Revenue in major units. */
  value: number;
  /** ISO currency code. */
  currency: string;
  tier: string;
}

export type Ga4SendResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'invalid_event' | 'request_failed' };

function getMeasurementId(): string | undefined {
  return process.env.GA4_MEASUREMENT_ID?.trim() || undefined;
}

function getApiSecret(): string | undefined {
  return process.env.GA4_API_SECRET?.trim() || undefined;
}

/** True when both halves of the credential are present. */
export function isGa4MeasurementProtocolConfigured(): boolean {
  return Boolean(getMeasurementId() && getApiSecret());
}

/**
 * Report a paid conversion to GA4.
 *
 * Never throws. Returns why it did not send so the caller can log a real gap
 * (a conversion with no client id) differently from an unconfigured
 * environment, where silence is expected.
 */
export async function sendGa4PurchaseEvent(event: Ga4PurchaseEvent): Promise<Ga4SendResult> {
  const measurementId = getMeasurementId();
  const apiSecret = getApiSecret();

  if (!measurementId || !apiSecret) {
    // Expected in development and preview; only production carries the secret.
    console.log('GA4 Measurement Protocol is not configured; skipping purchase event');
    return { sent: false, reason: 'not_configured' };
  }

  // A purchase with no client id would be recorded against an invented user, so
  // it is better to drop it and leave the gap visible in the logs.
  if (!/^\d+\.\d+$/.test(event.clientId) || !event.transactionId) {
    console.warn('Refusing to send a GA4 purchase without a usable client id and transaction id');
    return { sent: false, reason: 'invalid_event' };
  }

  const url = `${MEASUREMENT_PROTOCOL_URL}?measurement_id=${encodeURIComponent(measurementId)}` +
    `&api_secret=${encodeURIComponent(apiSecret)}`;

  const currency = event.currency.toUpperCase();
  const body = {
    client_id: event.clientId,
    // Without this the event lands at "now" but is attributed to a fresh
    // session; GA4 still credits the original user via client_id.
    non_personalized_ads: false,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: event.transactionId,
          value: event.value,
          currency,
          tier: event.tier,
          // GA4's recommended purchase event specifies items. Revenue does
          // register without it — the browser path has been reporting through
          // GTM with only transaction-level params — but the ecommerce reports
          // stay empty, and the collect endpoint answers 2xx either way, so a
          // missing items array fails silently.
          items: [
            {
              item_id: `subscription_${event.tier}`,
              item_name: `Ask Linc ${event.tier}`,
              item_category: 'subscription',
              price: event.value,
              quantity: 1,
            },
          ],
        },
      },
    ],
  };

  // A failure here is not retried until the next monthly invoice, which would
  // report the conversion a month late, so it is worth a couple of immediate
  // attempts to ride out a blip. Bounded well inside Stripe's webhook timeout.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // The collect endpoint answers 2xx for anything it accepts and does not
      // report per-event validation errors; those need the /debug endpoint.
      if (response.ok) {
        console.log(`GA4 purchase reported for transaction ${event.transactionId}`);
        return { sent: true };
      }

      console.error(
        `GA4 Measurement Protocol responded ${response.status} for ${event.transactionId} (attempt ${attempt})`
      );
      // 4xx means the request itself is wrong; repeating it changes nothing.
      if (response.status < 500) return { sent: false, reason: 'request_failed' };
    } catch (error) {
      console.error(
        `Failed to send the GA4 purchase event (attempt ${attempt}):`,
        error instanceof Error ? error.message : error
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return { sent: false, reason: 'request_failed' };
}
