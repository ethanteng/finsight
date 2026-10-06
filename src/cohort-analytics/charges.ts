/** Stripe events that record a collected invoice. Both are read; the earliest wins. */
export const CHARGE_EVENT_TYPES = ['invoice.payment_succeeded', 'invoice.paid'] as const;

export interface LoggedChargeEvent {
  eventData: unknown;
  processedAt: Date;
  /** Set when the webhook could resolve the subscription row at logging time. */
  subscriptionUserId: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stripeId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  const id = record(value)?.id;
  return typeof id === 'string' && id ? id : null;
}

function fromSeconds(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value * 1000) : null;
}

/**
 * The first charge above zero per user, from logged invoice webhooks.
 *
 * A $0 invoice opens every trial, so only `amount_paid > 0` starts a paid
 * clock. The invoice names its subscription at `invoice.subscription` before
 * the 2025-03-31 API and at `parent.subscription_details.subscription` after,
 * so both are read; the customer is the fallback when neither resolves.
 */
export function firstChargesFromEvents(
  events: LoggedChargeEvent[],
  userByCustomer: Map<string, string>,
  userBySubscription: Map<string, string>,
): Map<string, Date> {
  const firsts = new Map<string, Date>();
  for (const event of events) {
    const invoice = record(record(event.eventData)?.object);
    if (!invoice) continue;
    const amountPaid = invoice.amount_paid;
    if (typeof amountPaid !== 'number' || amountPaid <= 0) continue;

    const subscriptionId = stripeId(invoice.subscription)
      ?? stripeId(record(record(invoice.parent)?.subscription_details)?.subscription);
    const customerId = stripeId(invoice.customer);
    const userId = event.subscriptionUserId
      ?? (subscriptionId ? userBySubscription.get(subscriptionId) : undefined)
      ?? (customerId ? userByCustomer.get(customerId) : undefined);
    if (!userId) continue;

    const paidAt = fromSeconds(record(invoice.status_transitions)?.paid_at)
      ?? fromSeconds(invoice.created)
      ?? event.processedAt;
    const current = firsts.get(userId);
    if (!current || paidAt.getTime() < current.getTime()) firsts.set(userId, paidAt);
  }
  return firsts;
}
