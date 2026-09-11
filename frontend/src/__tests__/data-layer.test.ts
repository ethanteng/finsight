import {
  pushBeginCheckout,
  pushCoastFireCalculated,
  pushPurchase,
  pushRetirementModelRun,
  pushSignUp,
  pushStartFreeClick,
  pushTrialLoginError,
  pushTrialLoginSubmit,
  pushTrialLoginSuccess,
  pushTrialLoginViewed,
  pushTrialSignupRegistrationError,
  pushTrialSignupStarted,
  pushTrialSignupSubmit,
  pushTrialSignupValidationError,
  pushTrialSignupViewed,
  pushTrialStartedVerified,
  pushTrialVerifyError,
  pushTrialVerifySubmit,
  pushTrialVerifySuccess,
  pushTrialVerifyViewed,
  pushViewExamples,
  pushViewMoreExamples,
} from "@/lib/dataLayer";
import { GET_STARTED_HREF } from "@/lib/site-nav";
import { INTERNAL_ANALYTICS_BROWSER_KEY } from "@/lib/internal-analytics";

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

  it("attributes answer-page CTA intent once through the GTM data layer", () => {
    pushBeginCheckout("answer_product_bridge");

    const event = {
      event: "begin_checkout",
      source_page: "/can-i-retire-with-2-million",
      cta_location: "answer_product_bridge",
      content_type: "retirement_answer",
    };
    expect(analyticsWindow.dataLayer).toContainEqual(event);
    expect(analyticsWindow.dataLayer).toHaveLength(1);
    expect(analyticsWindow.gtag).not.toHaveBeenCalled();
  });

  it("does not queue events from a browser marked as internal", () => {
    window.localStorage.setItem(INTERNAL_ANALYTICS_BROWSER_KEY, '1');
    try {
      pushBeginCheckout('internal_check');
      expect(analyticsWindow.dataLayer).toEqual([]);
    } finally {
      window.localStorage.removeItem(INTERNAL_ANALYTICS_BROWSER_KEY);
    }
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

  it("classifies the calculator separately from the guides it sits beside", () => {
    window.history.replaceState({}, "", "/retirement-calculator");

    pushBeginCheckout("quickplan_cross_sell");

    expect(analyticsWindow.dataLayer).toContainEqual(expect.objectContaining({
      source_page: "/retirement-calculator",
      cta_location: "quickplan_cross_sell",
      content_type: "retirement_calculator",
    }));
  });

  it("classifies the model run the same way the CTA that follows it is classified", () => {
    window.history.replaceState({}, "", "/retirement-calculator");

    pushRetirementModelRun(62);

    expect(analyticsWindow.dataLayer).toContainEqual({
      event: "retirement_model_run",
      source_page: "/retirement-calculator",
      content_type: "retirement_calculator",
      retirement_age: 62,
    });
  });

  it("keeps the Coast FIRE acquisition path distinct without recording financial values", () => {
    window.history.replaceState({}, "", "/coast-fire-calculator");
    pushCoastFireCalculated("reached", 25);
    pushStartFreeClick("coast_fire_cross_sell");

    expect(analyticsWindow.dataLayer).toEqual([
      {
        event: "coast_fire_calculated",
        source_page: "/coast-fire-calculator",
        content_type: "coast_fire_calculator",
        coast_fire_status: "reached",
        years_to_retirement: 25,
      },
      {
        event: "start_free_click",
        source_page: "/coast-fire-calculator",
        cta_location: "coast_fire_cross_sell",
        content_type: "coast_fire_calculator",
        destination_page: GET_STARTED_HREF,
      },
    ]);
  });
});

describe("free-signup funnel analytics", () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    analyticsWindow.dataLayer = [];
    window.history.replaceState({}, "", "/can-i-retire-at-60");
  });

  it("tracks Start free CTA intent without calling it a checkout", () => {
    pushStartFreeClick("answer_product_bridge");

    expect(analyticsWindow.dataLayer).toEqual([{
      event: "start_free_click",
      source_page: "/can-i-retire-at-60",
      cta_location: "answer_product_bridge",
      content_type: "retirement_answer",
      destination_page: GET_STARTED_HREF,
    }]);
  });

  it("uses GA4's recommended event after email account creation", () => {
    window.history.replaceState({}, "", GET_STARTED_HREF);

    pushSignUp({ signupFlow: "free_trial" });

    expect(analyticsWindow.dataLayer).toEqual([{
      event: "sign_up",
      method: "email",
      source_page: GET_STARTED_HREF,
      signup_flow: "free_trial",
    }]);
  });

  it("emits the complete no-card funnel with only fixed, non-sensitive parameters", () => {
    window.history.replaceState({}, "", GET_STARTED_HREF);
    pushTrialSignupViewed();
    pushTrialSignupStarted();
    pushTrialSignupSubmit();
    pushTrialSignupValidationError();
    pushTrialSignupRegistrationError('server_rejected');

    window.history.replaceState({}, "", "/verify-email?signup_flow=free_trial");
    pushTrialVerifyViewed();
    pushTrialVerifySubmit();
    pushTrialVerifyError('network_error');
    pushTrialVerifySuccess();

    window.history.replaceState({}, "", "/login?signup_flow=free_trial");
    pushTrialLoginViewed();
    pushTrialLoginSubmit();
    pushTrialLoginError('unknown');
    pushTrialLoginSuccess();

    expect(analyticsWindow.dataLayer).toEqual([
      { event: 'trial_signup_viewed', source_page: '/getstarted', signup_flow: 'free_trial' },
      { event: 'trial_signup_started', source_page: '/getstarted', signup_flow: 'free_trial' },
      { event: 'trial_signup_submit', source_page: '/getstarted', signup_flow: 'free_trial' },
      {
        event: 'trial_signup_validation_error',
        source_page: '/getstarted',
        signup_flow: 'free_trial',
        validation_reason: 'password_requirements',
      },
      {
        event: 'trial_signup_registration_error',
        source_page: '/getstarted',
        signup_flow: 'free_trial',
        error_category: 'server_rejected',
      },
      { event: 'trial_verify_viewed', source_page: '/verify-email', signup_flow: 'free_trial' },
      { event: 'trial_verify_submit', source_page: '/verify-email', signup_flow: 'free_trial' },
      {
        event: 'trial_verify_error',
        source_page: '/verify-email',
        signup_flow: 'free_trial',
        error_category: 'network_error',
      },
      { event: 'trial_verify_success', source_page: '/verify-email', signup_flow: 'free_trial' },
      { event: 'trial_login_viewed', source_page: '/login', signup_flow: 'free_trial' },
      { event: 'trial_login_submit', source_page: '/login', signup_flow: 'free_trial' },
      {
        event: 'trial_login_error',
        source_page: '/login',
        signup_flow: 'free_trial',
        error_category: 'unknown',
      },
      { event: 'trial_login_success', source_page: '/login', signup_flow: 'free_trial' },
    ]);

    const serialized = JSON.stringify(analyticsWindow.dataLayer);
    expect(serialized).not.toMatch(/person@example\.com|Password1|123456/);
  });

  it("normalizes unexpected error input instead of forwarding raw text", () => {
    window.history.replaceState({}, "", GET_STARTED_HREF);

    pushTrialSignupRegistrationError('Account person@example.com was rejected');
    pushTrialVerifyError({ code: '123456' });
    pushTrialLoginError(new Error('password was wrong'));

    expect(analyticsWindow.dataLayer).toEqual([
      expect.objectContaining({ event: 'trial_signup_registration_error', error_category: 'unknown' }),
      expect.objectContaining({ event: 'trial_verify_error', error_category: 'unknown' }),
      expect.objectContaining({ event: 'trial_login_error', error_category: 'unknown' }),
    ]);
    expect(JSON.stringify(analyticsWindow.dataLayer)).not.toMatch(/person@example|123456|password was wrong/);
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
      // Same shape the server sends for a trial conversion, so the two paths
      // do not disagree about the sale they describe.
      items: [{
        item_id: "subscription_premium",
        item_name: "Ask Linc premium",
        item_category: "subscription",
        price: 19,
        quantity: 1,
      }],
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

describe("trial-start analytics", () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    analyticsWindow.dataLayer = [];
    window.sessionStorage.clear();
  });

  it("reports the verified trial with checkout identity and setup path", () => {
    expect(pushTrialStartedVerified({
      transactionId: "cs_trial_123",
      tier: "premium",
      signupPath: "/register",
    })).toBe(true);

    expect(analyticsWindow.dataLayer).toEqual([{
      event: "trial_started_verified",
      transaction_id: "cs_trial_123",
      tier: "premium",
      signup_path: "/register",
    }]);
  });

  it("reports a checkout once and keeps separate trials distinct", () => {
    expect(pushTrialStartedVerified({ transactionId: "cs_trial_a", tier: "premium", signupPath: "/register" })).toBe(true);
    expect(pushTrialStartedVerified({ transactionId: "cs_trial_a", tier: "premium", signupPath: "/register" })).toBe(false);
    expect(pushTrialStartedVerified({ transactionId: "cs_trial_b", tier: "premium", signupPath: "/register" })).toBe(true);

    expect(analyticsWindow.dataLayer).toHaveLength(2);
  });

  it("drops an invalid checkout id and an invalid optional path", () => {
    expect(pushTrialStartedVerified({ transactionId: "", tier: "premium", signupPath: "/register" })).toBe(false);
    expect(pushTrialStartedVerified({ transactionId: "cs_trial_path", tier: "enterprise", signupPath: "register" })).toBe(true);

    expect(analyticsWindow.dataLayer).toEqual([{
      event: "trial_started_verified",
      transaction_id: "cs_trial_path",
      tier: "premium",
    }]);
  });
});

describe("example-view analytics", () => {
  const analyticsWindow = window as AnalyticsWindow;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    analyticsWindow.dataLayer = [];
    analyticsWindow.gtag = jest.fn();
  });

  afterEach(() => {
    delete analyticsWindow.gtag;
  });

  // Same duplicate-emission shape begin_checkout had: these pushed to the data
  // layer and then called gtag directly, so a GA4 tag in GTM plus a directly
  // loaded gtag would each count the same interaction.
  it.each([
    ["view_examples", pushViewExamples],
    ["view_more_examples", pushViewMoreExamples],
  ])("sends %s once, through the data layer only", (event, push) => {
    push();

    expect(analyticsWindow.dataLayer).toEqual([{ event, source_page: "/" }]);
    expect(analyticsWindow.gtag).not.toHaveBeenCalled();
  });
});
