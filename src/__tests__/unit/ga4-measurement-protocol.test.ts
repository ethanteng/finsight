/**
 * A trial conversion reaches GA4 only through this module, and it runs inside a
 * billing webhook — so the rules it has to keep are: never throw, never invent a
 * client id, and never hang the webhook waiting on Google.
 */
import { sendGa4PurchaseEvent, isGa4MeasurementProtocolConfigured } from '../../services/ga4-measurement-protocol';

const validEvent = {
  clientId: '1234567890.1700000000',
  transactionId: 'cs_test_123',
  value: 29,
  currency: 'usd',
  tier: 'premium'
};

describe('sendGa4PurchaseEvent', () => {
  const originalEnv = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.GA4_MEASUREMENT_ID = 'G-TESTID';
    process.env.GA4_API_SECRET = 'secret';
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('posts the purchase with the params the GA4 tag maps', async () => {
    const result = await sendGa4PurchaseEvent(validEvent);

    expect(result).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('measurement_id=G-TESTID');
    expect(url).toContain('api_secret=secret');

    const body = JSON.parse(init.body);
    expect(body.client_id).toBe('1234567890.1700000000');
    expect(body.events[0]).toMatchObject({
      name: 'purchase',
      params: {
        transaction_id: 'cs_test_123',
        value: 29,
        currency: 'USD',
        tier: 'premium'
      }
    });
  });

  it('describes the sale as an item so ecommerce reports are populated', () => {
    // collect answers 2xx whether or not items is present, so an omitted array
    // would leave the ecommerce reports empty with nothing to show for it.
    return sendGa4PurchaseEvent(validEvent).then(() => {
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);

      expect(body.events[0].params.items).toEqual([{
        item_id: 'subscription_premium',
        item_name: 'Ask Linc premium',
        item_category: 'subscription',
        price: 29,
        quantity: 1
      }]);
    });
  });

  it('does nothing when the credential is not configured', async () => {
    delete process.env.GA4_API_SECRET;

    expect(await sendGa4PurchaseEvent(validEvent)).toEqual({ sent: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing client id', undefined],
    ['a placeholder', 'unknown'],
    ['a partial id', '1234567890'],
  ])('refuses to report a conversion with %s', async (_label, clientId) => {
    // Sending without a real client id would credit the sale to an invented
    // user under (direct)/(none) — worse than reporting nothing.
    const result = await sendGa4PurchaseEvent({ ...validEvent, clientId: clientId as string });

    expect(result).toEqual({ sent: false, reason: 'invalid_event' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a persistent server error as a failure rather than throwing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    expect(await sendGa4PurchaseEvent(validEvent)).toEqual({ sent: false, reason: 'request_failed' });
  });

  it('retries a server error, since the alternative is reporting a month late', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    expect(await sendGa4PurchaseEvent(validEvent)).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a transport error too', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    expect(await sendGa4PurchaseEvent(validEvent)).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx, which would fail identically', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    expect(await sendGa4PurchaseEvent(validEvent)).toEqual({ sent: false, reason: 'request_failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('swallows a persistent transport error so the webhook still completes', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(sendGa4PurchaseEvent(validEvent)).resolves.toEqual({
      sent: false,
      reason: 'request_failed'
    });
  });

  it('aborts rather than hanging the webhook on a slow response', async () => {
    const result = await sendGa4PurchaseEvent(validEvent);

    expect(result).toEqual({ sent: true });
    // An AbortSignal is what bounds the wait; without it a stalled request
    // would hold the webhook open until Stripe's own timeout.
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });
});

describe('isGa4MeasurementProtocolConfigured', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('needs both halves of the credential', () => {
    process.env.GA4_MEASUREMENT_ID = 'G-TESTID';
    delete process.env.GA4_API_SECRET;
    expect(isGa4MeasurementProtocolConfigured()).toBe(false);

    process.env.GA4_API_SECRET = 'secret';
    expect(isGa4MeasurementProtocolConfigured()).toBe(true);
  });
});
