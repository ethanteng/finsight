import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildGoogleTagManagerSnippet,
  isAnalyticsHost,
  shouldRenderNoscriptFallback,
} from "@/lib/analytics-host";

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
function runSnippet(hostname: string) {
  const inserted: Array<{ src?: string; async?: boolean }> = [];
  const firstScript = {
    parentNode: { insertBefore: (node: { src?: string }) => inserted.push(node) },
  };
  const doc = {
    getElementsByTagName: () => [firstScript],
    createElement: () => ({} as { src?: string }),
  };
  const win: { location: { hostname: string }; dataLayer?: unknown[] } = {
    location: { hostname },
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
