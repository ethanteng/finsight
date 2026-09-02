import { pushBeginCheckout, pushPurchase } from "@/lib/dataLayer";

type AnalyticsWindow = Window & typeof globalThis & {
  dataLayer?: Array<Record<string, unknown> | unknown[]>;
  gtag?: jest.Mock;
};

describe("begin_checkout analytics", () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    window.history.replaceState({}, "", "/can-i-retire-with-2-million");
    analyticsWindow.dataLayer = [];
    analyticsWindow.gtag = jest.fn();
  });

  afterEach(() => {
    delete analyticsWindow.gtag;
  });

  it("attributes answer-page CTA intent across configured analytics providers", () => {
    pushBeginCheckout("answer_product_bridge");

    const event = {
      event: "begin_checkout",
      source_page: "/can-i-retire-with-2-million",
      cta_location: "answer_product_bridge",
      content_type: "retirement_answer",
    };
    expect(analyticsWindow.dataLayer).toContainEqual(event);
    expect(analyticsWindow.gtag).toHaveBeenCalledWith("event", "begin_checkout", event);
  });

  it("classifies the library separately from individual answers", () => {
    window.history.replaceState({}, "", "/retirement-answers");

    pushBeginCheckout("page_cta");

    expect(analyticsWindow.dataLayer).toContainEqual(expect.objectContaining({
      source_page: "/retirement-answers",
      cta_location: "page_cta",
      content_type: "retirement_answers_hub",
    }));
  });
});

describe("purchase analytics", () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    analyticsWindow.dataLayer = [];
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reports a paid checkout with the fields the GA4 tag maps", () => {
    expect(pushPurchase({
      transactionId: "cs_test_123",
      value: 19,
      currency: "usd",
      tier: "premium",
    })).toBe(true);

    expect(analyticsWindow.dataLayer).toEqual([{
      event: "purchase",
      transaction_id: "cs_test_123",
      tier: "premium",
      value: 19,
      // GA4 expects an uppercase ISO code; the API can report either case.
      currency: "USD",
    }]);
  });

  it("reports each transaction once, and a second purchase separately", () => {
    expect(pushPurchase({ transactionId: "cs_a", value: 19, currency: "USD", tier: "premium" })).toBe(true);
    expect(pushPurchase({ transactionId: "cs_a", value: 19, currency: "USD", tier: "premium" })).toBe(false);
    // A distinct checkout in the same tab is a real second conversion, and the
    // old single-flag dedupe silently dropped it.
    expect(pushPurchase({ transactionId: "cs_b", value: 19, currency: "USD", tier: "premium" })).toBe(true);

    expect(analyticsWindow.dataLayer).toHaveLength(2);
    expect(analyticsWindow.dataLayer?.map(entry => (entry as Record<string, unknown>).transaction_id))
      .toEqual(["cs_a", "cs_b"]);
  });

  it.each([
    ["an unknown label", "enterprise"],
    ["a missing tier", undefined],
    ["a non-string tier", 7],
  ])("falls back to the sold tier for %s", (_label, tier) => {
    pushPurchase({ transactionId: "cs_tier", value: 19, currency: "USD", tier });

    expect(analyticsWindow.dataLayer).toContainEqual(
      expect.objectContaining({ tier: "premium" })
    );
  });

  it("accepts a known tier regardless of casing or padding", () => {
    pushPurchase({ transactionId: "cs_case", value: 19, currency: "USD", tier: " Standard " });

    expect(analyticsWindow.dataLayer).toContainEqual(
      expect.objectContaining({ tier: "standard" })
    );
  });

  it("does not report a purchase it cannot dedupe", () => {
    expect(pushPurchase({ transactionId: "", value: 19, currency: "USD", tier: "premium" })).toBe(false);

    expect(analyticsWindow.dataLayer).toHaveLength(0);
  });

  it("still counts the conversion when the amount is unusable", () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(pushPurchase({
      transactionId: "cs_no_amount",
      value: undefined,
      currency: undefined,
      tier: "premium",
    })).toBe(true);

    // Revenue is dropped rather than reported as 0 or NaN, but the purchase
    // itself is still the key event GA4 counts.
    expect(analyticsWindow.dataLayer).toEqual([{
      event: "purchase",
      transaction_id: "cs_no_amount",
      tier: "premium",
    }]);
  });

  it("reports once when two concurrent callers race on the same transaction", async () => {
    // React Strict Mode double-invokes effects in development, so the success
    // page can run its fetch twice. The check and the write in pushPurchase are
    // synchronous with no await between them, so whichever call lands first
    // marks the transaction before the other can be entered. This test fails if
    // pushPurchase is ever made async or the write is deferred.
    const fire = async () => {
      await Promise.resolve();
      return pushPurchase({ transactionId: "cs_race", value: 19, currency: "USD", tier: "premium" });
    };

    const [first, second] = await Promise.all([fire(), fire()]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(analyticsWindow.dataLayer).toHaveLength(1);
  });

  it("reports the purchase when session storage is unavailable", () => {
    // Safari private browsing and cookie-blocking extensions throw here. Losing
    // a conversion is worse than a duplicate, which GA4 dedupes on transaction_id.
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(pushPurchase({ transactionId: "cs_blocked", value: 19, currency: "USD", tier: "premium" })).toBe(true);
    expect(analyticsWindow.dataLayer).toHaveLength(1);
  });
});
