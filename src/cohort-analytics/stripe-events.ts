/** Stripe events that record a collected invoice. Both are read; the earliest wins. */
export const CHARGE_EVENT_TYPES = ['invoice.payment_succeeded', 'invoice.paid'] as const;

/** A logged webhook, trimmed to the fields these readers use. */
export interface LoggedStripeEvent {
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

function keepEarliest(map: Map<string, Date>, userId: string, at: Date): void {
  const current = map.get(userId);
  if (!current || at.getTime() < current.getTime()) map.set(userId, at);
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
  events: LoggedStripeEvent[],
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

    keepEarliest(firsts, userId, fromSeconds(record(invoice.status_transitions)?.paid_at)
      ?? fromSeconds(invoice.created)
      ?? event.processedAt);
  }
  return firsts;
}

/**
 * When each user's first Stripe trial began, from logged
 * `customer.subscription.*` webhooks. Every one of them carries the whole
 * subscription, and `trial_start` stays on it after the trial converts or
 * lapses, so a trial that is long over still dates its start.
 */
export function trialStartsFromEvents(
  events: LoggedStripeEvent[],
  userByCustomer: Map<string, string>,
  userBySubscription: Map<string, string>,
): Map<string, Date> {
  const starts = new Map<string, Date>();
  for (const event of events) {
    const subscription = record(record(event.eventData)?.object);
    if (!subscription) continue;
    const trialStart = fromSeconds(subscription.trial_start);
    if (!trialStart) continue;

    const subscriptionId = stripeId(subscription.id);
    const customerId = stripeId(subscription.customer);
    const userId = event.subscriptionUserId
      ?? (subscriptionId ? userBySubscription.get(subscriptionId) : undefined)
      ?? (customerId ? userByCustomer.get(customerId) : undefined);
    if (userId) keepEarliest(starts, userId, trialStart);
  }
  return starts;
}

export interface LocalSubscriptionRow {
  userId: string;
  status: string;
  createdAt: Date;
  currentPeriodStart: Date;
}

/**
 * Adds trials that are running now but whose webhooks were never logged.
 * "Convert to trial" writes its row before Stripe's webhook arrives, and a
 * trialing row's period starts when the trial did.
 */
export function addRunningTrials(starts: Map<string, Date>, rows: LocalSubscriptionRow[]): Map<string, Date> {
  for (const row of rows) {
    if (row.status !== 'trialing') continue;
    const start = row.currentPeriodStart.getTime() < row.createdAt.getTime() ? row.currentPeriodStart : row.createdAt;
    keepEarliest(starts, row.userId, start);
  }
  return starts;
}
