/**
 * Which invoices count as the conversion.
 *
 * Every new customer gets a 30-day trial, so the invoice that opens the
 * subscription collects $0 and is not a purchase, while the one a month later
 * is. Renewals after that are not new conversions either.
 */
import { stripeService } from '../../services/stripe';

jest.mock('../../services/stripe-email', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendTierChangeEmail: jest.fn().mockResolvedValue(true),
  sendCancellationEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../config/stripe', () => ({
  STRIPE_CONFIG: { subscriptionSettings: { trialPeriodDays: 30 } },
  stripe: {
    client: {
      subscriptions: { retrieve: jest.fn(), update: jest.fn() },
      checkout: { sessions: { list: jest.fn() } }
    }
  },
  getStripePriceId: jest.fn(),
  getTierFromPriceId: jest.fn().mockReturnValue('premium'),
  constructWebhookEvent: jest.fn(),
  getPublishableKey: jest.fn(),
  isStripeConfigured: jest.fn().mockReturnValue(true)
}));

jest.mock('../../services/ga4-measurement-protocol', () => ({
  sendGa4PurchaseEvent: jest.fn().mockResolvedValue({ sent: true })
}));

jest.mock('../../prisma-client', () => ({ getPrismaClient: jest.fn() }));

const mockStripe = require('../../config/stripe');
const { sendGa4PurchaseEvent } = require('../../services/ga4-measurement-protocol');
const { getPrismaClient } = require('../../prisma-client');

/** Reach the private reporter the webhook calls once provisioning is done. */
const report = (invoice: any, subscription: any) =>
  (stripeService as any).reportPaidConversionToGa4(invoice, subscription);

function subscriptionWith(metadata: Record<string, string>) {
  return {
    id: 'sub_123',
    metadata,
    items: { data: [{ price: { id: 'price_live_abc' } }] }
  };
}

const paidInvoice = { amount_paid: 2900, currency: 'usd' };

describe('reporting a trial conversion to GA4', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendGa4PurchaseEvent.mockResolvedValue({ sent: true });
    mockStripe.getTierFromPriceId.mockReturnValue('premium');
    mockStripe.stripe.client.checkout.sessions.list.mockResolvedValue({
      data: [{ id: 'cs_test_original' }]
    });
    mockStripe.stripe.client.subscriptions.update.mockResolvedValue({});
    (getPrismaClient as jest.Mock).mockReturnValue({});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports the first real charge after a trial', async () => {
    await report(paidInvoice, subscriptionWith({ ga_client_id: '111.222' }));

    expect(sendGa4PurchaseEvent).toHaveBeenCalledWith({
      clientId: '111.222',
      // The checkout session, not the invoice: the browser-side purchase on a
      // no-trial checkout uses the same id, so GA4 dedupes the two paths.
      transactionId: 'cs_test_original',
      value: 29,
      currency: 'usd',
      tier: 'premium'
    });
  });

  it('ignores the $0 invoice that opens a trial', async () => {
    await report({ amount_paid: 0, currency: 'usd' }, subscriptionWith({ ga_client_id: '111.222' }));

    expect(sendGa4PurchaseEvent).not.toHaveBeenCalled();
  });

  it('does not report a renewal as a second conversion', async () => {
    await report(paidInvoice, subscriptionWith({
      ga_client_id: '111.222',
      ga_purchase_reported: '2026-09-01T00:00:00.000Z'
    }));

    expect(sendGa4PurchaseEvent).not.toHaveBeenCalled();
  });

  it('marks the subscription once reported, preserving its other metadata', async () => {
    await report(paidInvoice, subscriptionWith({ ga_client_id: '111.222', tier: 'premium' }));

    const [, update] = mockStripe.stripe.client.subscriptions.update.mock.calls[0];
    expect(update.metadata).toMatchObject({ ga_client_id: '111.222', tier: 'premium' });
    expect(update.metadata.ga_purchase_reported).toEqual(expect.any(String));
  });

  it('stops retrying a subscription that can never be attributed', async () => {
    // No client id was ever captured, so it will not appear on a later invoice.
    sendGa4PurchaseEvent.mockResolvedValue({ sent: false, reason: 'invalid_event' });

    await report(paidInvoice, subscriptionWith({}));

    expect(mockStripe.stripe.client.subscriptions.update).toHaveBeenCalled();
  });

  it('leaves a transport failure unmarked so a later invoice retries', async () => {
    sendGa4PurchaseEvent.mockResolvedValue({ sent: false, reason: 'request_failed' });

    await report(paidInvoice, subscriptionWith({ ga_client_id: '111.222' }));

    // GA4 dedupes on the transaction id, so the retry cannot double-count.
    expect(mockStripe.stripe.client.subscriptions.update).not.toHaveBeenCalled();
  });

  it('falls back to the subscription id when no checkout session is found', async () => {
    mockStripe.stripe.client.checkout.sessions.list.mockResolvedValue({ data: [] });

    await report(paidInvoice, subscriptionWith({ ga_client_id: '111.222' }));

    expect(sendGa4PurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'sub_123' })
    );
  });

  it('never throws out of the billing webhook', async () => {
    sendGa4PurchaseEvent.mockRejectedValue(new Error('boom'));

    await expect(
      report(paidInvoice, subscriptionWith({ ga_client_id: '111.222' }))
    ).resolves.toBeUndefined();
  });
});

describe('a paid conversion on a subscription with no local row', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    sendGa4PurchaseEvent.mockResolvedValue({ sent: true });
    mockStripe.getTierFromPriceId.mockReturnValue('premium');
    mockStripe.stripe.client.checkout.sessions.list.mockResolvedValue({
      data: [{ id: 'cs_abandoned' }]
    });
    mockStripe.stripe.client.subscriptions.update.mockResolvedValue({});
    mockStripe.stripe.client.subscriptions.retrieve.mockResolvedValue(
      subscriptionWith({ ga_client_id: '333.444' })
    );
    // A buyer who finished Checkout but abandoned registration has no user, so
    // handleSubscriptionCreated never wrote a subscription row.
    mockPrisma = { subscription: { findUnique: jest.fn().mockResolvedValue(null) } };
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  const handlePaymentSucceeded = (invoice: any) =>
    (stripeService as any).handlePaymentSucceeded({ object: invoice });

  it('still reports the sale Stripe collected', async () => {
    await handlePaymentSucceeded({ subscription: 'sub_123', amount_paid: 2900, currency: 'usd' });

    expect(sendGa4PurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: '333.444', transactionId: 'cs_abandoned', value: 29 })
    );
  });

  it('reports nothing for the $0 invoice that opens the trial', async () => {
    await handlePaymentSucceeded({ subscription: 'sub_123', amount_paid: 0, currency: 'usd' });

    expect(sendGa4PurchaseEvent).not.toHaveBeenCalled();
  });

  it('does not throw when the subscription cannot be fetched', async () => {
    mockStripe.stripe.client.subscriptions.retrieve.mockRejectedValue(new Error('stripe down'));

    await expect(
      handlePaymentSucceeded({ subscription: 'sub_123', amount_paid: 2900, currency: 'usd' })
    ).resolves.toBeUndefined();
  });
});
