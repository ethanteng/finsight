/**
 * The price we charge and the price we advertise both come from this module, so
 * these cover the env resolution order, the live Stripe lookup, and the
 * fallback that keeps checkout working when Stripe is unreachable.
 */

const retrieveMock = jest.fn();

jest.mock('../../config/stripe', () => ({
  stripe: {
    get client() {
      return { prices: { retrieve: retrieveMock } };
    },
  },
}));

const PRICE_ENV_VARS = [
  'STRIPE_PRICE_DEFAULT',
  'STRIPE_PRICE_PREMIUM',
  'STRIPE_PRICE_STANDARD',
  'STRIPE_PRICE_STARTER',
];

const originalEnv = process.env;

function loadModule() {
  // Re-require so module-level cache state does not leak between tests.
  let mod: typeof import('../../config/stripe-pricing');
  jest.isolateModules(() => {
    mod = require('../../config/stripe-pricing');
  });
  return mod!;
}

beforeEach(() => {
  retrieveMock.mockReset();
  process.env = { ...originalEnv };
  PRICE_ENV_VARS.forEach((name) => delete process.env[name]);
});

afterEach(() => {
  process.env = originalEnv;
});

describe('getDefaultStripePriceId', () => {
  it('prefers STRIPE_PRICE_DEFAULT', () => {
    process.env.STRIPE_PRICE_DEFAULT = 'price_default';
    process.env.STRIPE_PRICE_PREMIUM = 'price_legacy';
    expect(loadModule().getDefaultStripePriceId()).toBe('price_default');
  });

  it('falls back to the legacy per-tier variables', () => {
    process.env.STRIPE_PRICE_PREMIUM = 'price_legacy';
    expect(loadModule().getDefaultStripePriceId()).toBe('price_legacy');
  });

  it('ignores a blank value', () => {
    process.env.STRIPE_PRICE_DEFAULT = '   ';
    process.env.STRIPE_PRICE_STANDARD = 'price_standard';
    expect(loadModule().getDefaultStripePriceId()).toBe('price_standard');
  });

  it('uses the built-in fallback price ID when nothing is configured', () => {
    const mod = loadModule();
    expect(mod.getDefaultStripePriceId()).toBe(mod.FALLBACK_PRICE_ID);
  });
});

describe('getDefaultPrice', () => {
  it('reads the amount back from the configured Stripe price', async () => {
    process.env.STRIPE_PRICE_DEFAULT = 'price_default';
    retrieveMock.mockResolvedValue({
      id: 'price_default',
      unit_amount: 2500,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    });

    const price = await loadModule().getDefaultPrice();

    expect(retrieveMock).toHaveBeenCalledWith('price_default');
    expect(price).toMatchObject({
      priceId: 'price_default',
      unitAmount: 2500,
      amount: 25,
      currency: 'usd',
      interval: 'month',
      formattedAmount: '$25',
      label: '$25/month',
      live: true,
    });
  });

  it('keeps the cents when the amount is not whole', async () => {
    process.env.STRIPE_PRICE_DEFAULT = 'price_default';
    retrieveMock.mockResolvedValue({
      id: 'price_default',
      unit_amount: 1499,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    });

    const price = await loadModule().getDefaultPrice();
    expect(price.formattedAmount).toBe('$14.99');
    expect(price.label).toBe('$14.99/month');
  });

  it('describes a multi-interval price', async () => {
    process.env.STRIPE_PRICE_DEFAULT = 'price_default';
    retrieveMock.mockResolvedValue({
      id: 'price_default',
      unit_amount: 5000,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 3 },
    });

    expect((await loadModule().getDefaultPrice()).label).toBe('$50 every 3 months');
  });

  it('memoizes so repeated reads do not hit Stripe every time', async () => {
    process.env.STRIPE_PRICE_DEFAULT = 'price_default';
    retrieveMock.mockResolvedValue({
      id: 'price_default',
      unit_amount: 1900,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    });

    const mod = loadModule();
    await mod.getDefaultPrice();
    await mod.getDefaultPrice();
    expect(retrieveMock).toHaveBeenCalledTimes(1);

    await mod.getDefaultPrice({ forceRefresh: true });
    expect(retrieveMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the paired $19 fallback price ID when Stripe is unreachable', async () => {
    process.env.STRIPE_PRICE_DEFAULT = 'price_default';
    retrieveMock.mockRejectedValue(new Error('Stripe is down'));

    const mod = loadModule();
    const price = await mod.getDefaultPrice();

    expect(price).toMatchObject({
      priceId: mod.FALLBACK_PRICE_ID,
      amount: 19,
      currency: 'usd',
      interval: 'month',
      formattedAmount: '$19',
      label: '$19/month',
      live: false,
    });
  });

  it('keeps the last live price through a brief Stripe outage', async () => {
    process.env.STRIPE_PRICE_DEFAULT = 'price_default';
    retrieveMock.mockResolvedValueOnce({
      id: 'price_default',
      unit_amount: 2500,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    });

    const mod = loadModule();
    const live = await mod.getDefaultPrice();
    expect(live.amount).toBe(25);
    expect(live.live).toBe(true);

    retrieveMock.mockRejectedValueOnce(new Error('Stripe is down'));
    const stale = await mod.getDefaultPrice({ forceRefresh: true });

    expect(stale).toMatchObject({
      priceId: 'price_default',
      amount: 25,
      live: true,
    });
  });

  it('falls back rather than advertising a price with no amount', async () => {
    process.env.STRIPE_PRICE_DEFAULT = 'price_default';
    // A tiered or metered price has no single amount to show.
    retrieveMock.mockResolvedValue({
      id: 'price_default',
      unit_amount: null,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1 },
    });

    const mod = loadModule();
    const price = await mod.getDefaultPrice();
    expect(price.live).toBe(false);
    expect(price.amount).toBe(19);
    expect(price.priceId).toBe(mod.FALLBACK_PRICE_ID);
  });
});
