import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildGoogleTagManagerSnippet,
  isAnalyticsHost,
  isMarketingPath,
  redactAnalyticsUrl,
  shouldRenderNoscriptFallback,
} from "@/lib/analytics-host";
import { INTERNAL_ANALYTICS_BROWSER_KEY } from "@/lib/internal-analytics";

describe("isAnalyticsHost", () => {
  it.each(["asklinc.com", "www.asklinc.com", "blog.asklinc.com", "app.asklinc.com"])(
    "accepts the production host %s",
    (hostname) => {
      expect(isAnalyticsHost(hostname)).toBe(true);
    },
  );

  it.each([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "finsight-git-main-ethanteng.vercel.app",
    "finsight-abc123.vercel.app",
    // Lookalikes: a bare suffix match would wrongly accept these.
    "notasklinc.com",
    "asklinc.com.example.net",
    "asklinc.com.evil.co",
  ])("rejects %s", (hostname) => {
    expect(isAnalyticsHost(hostname)).toBe(false);
  });
});

/**
 * Runs the real snippet the page ships, with `window`/`document` shadowed by
 * the function parameters, so the assertions are about shipped behaviour
 * rather than a reimplementation of it.
 */
function runSnippet(hostname: string, internal = false) {
  const inserted: Array<{ src?: string; async?: boolean }> = [];
  const firstScript = {
    parentNode: { insertBefore: (node: { src?: string }) => inserted.push(node) },
  };
  const doc = {
    getElementsByTagName: () => [firstScript],
    createElement: () => ({} as { src?: string }),
  };
  const win: { location: { hostname: string }; dataLayer?: unknown[]; localStorage: { getItem: (key: string) => string | null } } = {
    location: { hostname },
    localStorage: { getItem: key => internal && key === INTERNAL_ANALYTICS_BROWSER_KEY ? '1' : null },
  };

  new Function("window", "document", buildGoogleTagManagerSnippet("GTM-PL362L36"))(win, doc);

  return { inserted, dataLayer: win.dataLayer };
}

describe("Google Tag Manager snippet", () => {
  it("loads GTM on the production host", () => {
    const { inserted, dataLayer } = runSnippet("asklinc.com");

    expect(inserted).toHaveLength(1);
    expect(inserted[0].src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-PL362L36");
    expect(dataLayer).toHaveLength(1);
  });

  it("loads GTM on a production subdomain", () => {
    expect(runSnippet("www.asklinc.com").inserted).toHaveLength(1);
  });

  it("loads nothing for a browser marked by the authenticated admin dashboard", () => {
    const { inserted, dataLayer } = runSnippet('asklinc.com', true);
    expect(inserted).toEqual([]);
    expect(dataLayer).toBeUndefined();
  });

  it.each(["localhost", "127.0.0.1", "finsight-abc123.vercel.app", "notasklinc.com"])(
    "loads nothing and touches no dataLayer on %s",
    (hostname) => {
      const { inserted, dataLayer } = runSnippet(hostname);

      expect(inserted).toEqual([]);
      // Not even the gtm.start push: an untouched dataLayer means GTM cannot
      // replay queued events if it is ever loaded some other way.
      expect(dataLayer).toBeUndefined();
    },
  );
});

describe("noscript fallback", () => {
  it("renders only for a production build", () => {
    expect(shouldRenderNoscriptFallback("production")).toBe(true);
  });

  it.each(["preview", "development", undefined, ""])("is withheld for %s", (env) => {
    expect(shouldRenderNoscriptFallback(env)).toBe(false);
  });
});

describe("root layout wiring", () => {
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

  it("has no ungated GTM loader left inline", () => {
    // The gate is worthless if a second copy of the raw snippet survives.
    expect(layout).not.toContain("googletagmanager.com/gtm.js");
    expect(layout).toContain("buildGoogleTagManagerSnippet(GTM_CONTAINER_ID)");
  });

  it("gates the noscript iframe", () => {
    expect(layout).toContain("shouldRenderNoscriptFallback(process.env.VERCEL_ENV)");
  });
});

describe("isMarketingPath", () => {
  it.each([
    "/",
    "/pricing",
    "/blog/how-to-retire-at-55",
    "/use-cases/retirement",
    "/retirement-calculator",
    // Conversion pages: noindexed, but still the website's whole point.
    "/register",
    "/getstarted",
  ])("measures the website path %s", (pathname) => {
    expect(isMarketingPath(pathname)).toBe(true);
  });

  it.each([
    "/app",
    "/app/settings",
    "/finances",
    "/transactions",
    "/profile",
    "/admin/marketing",
    "/login",
    "/payment-success",
    "/forgot-password",
    "/verify-email",
    // Carries a live single-use reset token in the query string.
    "/reset-password",
  ])("skips the product path %s", (pathname) => {
    expect(isMarketingPath(pathname)).toBe(false);
  });

  it.each(["/apply", "/applications", "/logindetails", "/profiles-explained"])(
    "does not let a product prefix swallow the marketing path %s",
    (pathname) => {
      expect(isMarketingPath(pathname)).toBe(true);
    },
  );
});

describe("Vercel Web Analytics wiring", () => {
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  const wrapper = readFileSync(
    join(process.cwd(), "src/components/VercelAnalytics.tsx"),
    "utf8",
  );

  it("renders only the gated wrapper, never the raw component", () => {
    // An ungated <Analytics /> would record previews and the signed-in app.
    expect(layout).toContain("<VercelAnalytics />");
    expect(layout).not.toContain("@vercel/analytics");
  });

  it("gates on host, surface and the internal-browser opt-out", () => {
    expect(wrapper).toContain("isAnalyticsHost(url.hostname)");
    expect(wrapper).toContain("isMarketingPath(url.pathname)");
    expect(wrapper).toContain("isInternalAnalyticsBrowser()");
  });

  it("reports a redacted URL rather than the one the visitor arrived on", () => {
    expect(wrapper).toContain("redactAnalyticsUrl(url)");
    // Returning `event` unchanged would ship the raw query string.
    expect(wrapper).not.toMatch(/^\s*return event$/m);
  });
});

describe("redactAnalyticsUrl", () => {
  const redact = (href: string) => redactAnalyticsUrl(new URL(href));

  it("drops the email address the Stripe welcome email puts on /register", () => {
    // src/services/stripe-email.ts builds exactly this link.
    expect(
      redact("https://asklinc.com/register?email=someone%40example.com&tier=premium&source=stripe"),
    ).toBe("https://asklinc.com/register");
  });

  it("drops the email and session id the checkout redirect puts on /register", () => {
    // src/routes/stripe.ts assembles exactly this redirect.
    expect(
      redact(
        "https://asklinc.com/register?subscription=success&checkout=success" +
          "&tier=premium&session_id=cs_test_a1b2c3&email=someone%40example.com",
      ),
    ).toBe("https://asklinc.com/register");
  });

  it("keeps campaign attribution, which is the point of measuring the site", () => {
    expect(
      redact(
        "https://asklinc.com/?utm_source=google&utm_medium=cpc&utm_campaign=retire-at-62" +
          "&utm_term=retire+at+62&utm_content=variant-b&gclid=click_123",
      ),
    ).toBe(
      "https://asklinc.com/?utm_source=google&utm_medium=cpc&utm_campaign=retire-at-62" +
        "&utm_term=retire+at+62&utm_content=variant-b&gclid=click_123",
    );
  });

  it("drops ref, which names the handover bearer token and attributes nothing", () => {
    // lib/calculator-handover.ts uses ?ref= for a one-time token; the
    // homepage's own ref is read and discarded. Keeping it could only lose.
    expect(redact("https://asklinc.com/getstarted?ref=abc123def456")).toBe(
      "https://asklinc.com/getstarted",
    );
  });

  it("keeps the allowlisted parameters while dropping the rest of the same URL", () => {
    expect(
      redact("https://asklinc.com/register?utm_source=newsletter&email=someone%40example.com"),
    ).toBe("https://asklinc.com/register?utm_source=newsletter");
  });

  it("drops an unrecognised parameter rather than passing it through", () => {
    // The default for anything nobody has thought about yet is to drop it.
    expect(redact("https://asklinc.com/pricing?token=abc123&invite=xyz")).toBe(
      "https://asklinc.com/pricing",
    );
  });

  it("drops the fragment", () => {
    expect(redact("https://asklinc.com/faq?email=someone%40example.com#billing")).toBe(
      "https://asklinc.com/faq",
    );
  });

  it("preserves the path, including a nested one", () => {
    expect(redact("https://asklinc.com/blog/how-to-retire-at-55?email=a%40b.com")).toBe(
      "https://asklinc.com/blog/how-to-retire-at-55",
    );
  });
});
