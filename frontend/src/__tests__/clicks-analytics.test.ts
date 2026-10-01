import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLICKS_SCRIPT_SRC,
  CLICKS_SITE_ID,
  canCarryClicksTracker,
  canLoadClicksTracker,
  installClicksNavigationGuard,
  startClicksTracker,
} from "@/lib/clicks-analytics";
import { buildContentSecurityPolicy } from "@/lib/csp";
import { INTERNAL_ANALYTICS_BROWSER_KEY } from "@/lib/internal-analytics";

const SITE = "https://asklinc.com";

describe("canCarryClicksTracker", () => {
  it.each([
    `${SITE}/`,
    `${SITE}/pricing`,
    `${SITE}/blog/how-to-retire-at-55`,
    "https://www.asklinc.com/retirement-calculator",
    `${SITE}/register`,
    `${SITE}/?utm_source=newsletter&utm_medium=email`,
    `${SITE}/pricing?gclid=abc123`,
    // In-page anchors change only the fragment.
    `${SITE}/faq#cancel`,
  ])("carries the tracker on %s", (href) => {
    expect(canCarryClicksTracker(href)).toBe(true);
  });

  it.each([
    // Not the production site.
    "http://localhost:3001/",
    "https://finsight-git-main-ethanteng.vercel.app/pricing",
    "https://notasklinc.com/",
    // The product, not the website.
    `${SITE}/app`,
    `${SITE}/app/settings`,
    `${SITE}/finances`,
    `${SITE}/login`,
    `${SITE}/reset-password?token=live-single-use-token`,
    // Marketing paths whose query string the tracker would send whole.
    `${SITE}/register?email=someone%40example.com`,
    `${SITE}/register?email=someone%40example.com&session_id=cs_live_123`,
    `${SITE}/retirement-calculator?ref=handover-bearer-token`,
    `${SITE}/pricing?utm_source=x&anything=else`,
    "not a url",
  ])("refuses %s", (href) => {
    expect(canCarryClicksTracker(href)).toBe(false);
  });
});

describe("canLoadClicksTracker", () => {
  it.each([`${SITE}/`, `${SITE}/pricing?utm_source=newsletter`])("loads on %s", (href) => {
    expect(canLoadClicksTracker(href)).toBe(true);
  });

  it.each([
    // Whoever wrote the link wrote the fragment, and the tracker sends it whole.
    `${SITE}/register#email=someone%40example.com`,
    `${SITE}/#token=live-single-use-token`,
    `${SITE}/faq#cancel`,
    // Everything canCarryClicksTracker refuses, too.
    `${SITE}/app`,
    `${SITE}/register?email=someone%40example.com`,
    "https://finsight-abc123.vercel.app/",
    "not a url",
  ])("refuses %s", (href) => {
    expect(canLoadClicksTracker(href)).toBe(false);
  });
});

function fakeWindow(href: string) {
  const pushState = jest.fn();
  const replaceState = jest.fn();
  const win = {
    location: { href, assign: jest.fn(), replace: jest.fn() },
    history: { pushState, replaceState },
  };
  return { win, pushState, replaceState };
}

describe("installClicksNavigationGuard", () => {
  it("lets an in-page anchor link through without reloading", () => {
    const { win, pushState } = fakeWindow(`${SITE}/retirement-answers`);
    installClicksNavigationGuard(win as unknown as Window);

    win.history.pushState({}, "", "#by-portfolio");

    expect(pushState).toHaveBeenCalledWith({}, "", "#by-portfolio");
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it("lets a move to another reportable page through", () => {
    const { win, pushState } = fakeWindow(`${SITE}/`);
    installClicksNavigationGuard(win as unknown as Window);

    win.history.pushState({ __NA: true }, "", "/pricing");

    expect(pushState).toHaveBeenCalledWith({ __NA: true }, "", "/pricing");
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it("turns a client-side push into the app into a full page load", () => {
    const { win, pushState } = fakeWindow(`${SITE}/pricing`);
    installClicksNavigationGuard(win as unknown as Window);

    win.history.pushState({}, "", "/app");

    expect(pushState).not.toHaveBeenCalled();
    expect(win.location.assign).toHaveBeenCalledWith(`${SITE}/app`);
  });

  it("turns a replace onto a URL carrying an email into a full page load", () => {
    const { win, replaceState } = fakeWindow(`${SITE}/getstarted`);
    installClicksNavigationGuard(win as unknown as Window);

    win.history.replaceState({}, "", "/register?email=someone%40example.com");

    expect(replaceState).not.toHaveBeenCalled();
    expect(win.location.replace).toHaveBeenCalledWith(
      `${SITE}/register?email=someone%40example.com`,
    );
  });

  it("passes a state-only update straight through", () => {
    const { win, replaceState } = fakeWindow(`${SITE}/`);
    installClicksNavigationGuard(win as unknown as Window);

    win.history.replaceState({ scroll: 120 }, "");

    expect(replaceState).toHaveBeenCalledWith({ scroll: 120 }, "", undefined);
  });

  it("does nothing more once the document is on its way out", () => {
    const { win, pushState, replaceState } = fakeWindow(`${SITE}/`);
    installClicksNavigationGuard(win as unknown as Window);

    win.history.pushState({}, "", "/app");
    win.history.replaceState({}, "", "/");
    win.history.pushState({}, "", "/login");

    expect(win.location.assign).toHaveBeenCalledTimes(1);
    expect(win.location.replace).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe("startClicksTracker", () => {
  const loaded = () => document.head.querySelectorAll(`script[src="${CLICKS_SCRIPT_SRC}"]`);

  afterEach(() => {
    loaded().forEach(node => node.remove());
    window.localStorage.clear();
  });

  it("loads the tag with the site id on a production marketing page", () => {
    const { win } = fakeWindow(`${SITE}/`);

    expect(startClicksTracker(win as unknown as Window, document)).toBe(true);

    const scripts = loaded();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("data-site")).toBe(CLICKS_SITE_ID);
    expect((scripts[0] as HTMLScriptElement).defer).toBe(true);
  });

  it("guards navigation before the tracker can patch it", () => {
    const { win, pushState } = fakeWindow(`${SITE}/`);
    startClicksTracker(win as unknown as Window, document);

    win.history.pushState({}, "", "/app");

    expect(pushState).not.toHaveBeenCalled();
    expect(win.location.assign).toHaveBeenCalledWith(`${SITE}/app`);
  });

  it.each([
    `${SITE}/app`,
    `${SITE}/register?email=someone%40example.com`,
    `${SITE}/register#email=someone%40example.com`,
    "https://finsight-abc123.vercel.app/",
  ])("loads nothing and guards nothing on %s", (href) => {
    const { win, pushState } = fakeWindow(href);

    expect(startClicksTracker(win as unknown as Window, document)).toBe(false);
    expect(loaded()).toHaveLength(0);

    win.history.pushState({}, "", "/app");
    expect(pushState).toHaveBeenCalled();
  });

  it("loads nothing for a browser marked by the authenticated admin dashboard", () => {
    window.localStorage.setItem(INTERNAL_ANALYTICS_BROWSER_KEY, "1");
    const { win } = fakeWindow(`${SITE}/`);

    expect(startClicksTracker(win as unknown as Window, document)).toBe(false);
    expect(loaded()).toHaveLength(0);
  });

  it("loads once per document", () => {
    startClicksTracker(fakeWindow(`${SITE}/`).win as unknown as Window, document);
    startClicksTracker(fakeWindow(`${SITE}/`).win as unknown as Window, document);

    expect(loaded()).toHaveLength(1);
  });
});

describe("clicks.page wiring", () => {
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

  it("renders only the gated loader, never the raw tag", () => {
    expect(layout).toContain("<ClicksAnalytics />");
    expect(layout).not.toContain("clicks.page/t.js");
  });

  it("lets the policy load the tracker and accept its events", () => {
    const policy = buildContentSecurityPolicy({ isDevelopment: false });
    const directive = (name: string) =>
      policy.split("; ").find(part => part.startsWith(`${name} `)) ?? "";

    expect(directive("script-src")).toContain("https://clicks.page");
    expect(directive("connect-src")).toContain("https://clicks.page");
  });
});
