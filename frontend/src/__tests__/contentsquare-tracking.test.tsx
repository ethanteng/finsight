import { render } from "@testing-library/react";
import { buildContentSecurityPolicy } from "@/lib/csp";
import MarketingHome from "@/components/marketing/MarketingHome";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import IntegrationsPage from "@/components/marketing/IntegrationsPage";
import TrustPage from "@/components/marketing/TrustPage";
import { SiteHeader } from "@/components/marketing/SiteShell";

function directive(policy: string, name: string): string {
  const found = policy
    .split("; ")
    .find((entry) => entry === name || entry.startsWith(`${name} `));
  if (!found) throw new Error(`No ${name} directive in policy`);
  return found;
}

function overrideIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-cs-override-id]")).map(
    (element) => element.getAttribute("data-cs-override-id") as string,
  );
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => (seen.has(value) ? true : (seen.add(value), false)));
}

describe("Contentsquare content security policy", () => {
  const production = buildContentSecurityPolicy({ isDevelopment: false });
  const development = buildContentSecurityPolicy({ isDevelopment: true });

  it("allows every Contentsquare host to serve scripts", () => {
    // The capture toolbar that builds heatmaps loads from sibling hosts
    // (d., c. on .net, app. on .com), not just the tracking tag's t. host.
    expect(directive(production, "script-src")).toContain("https://*.contentsquare.net");
    expect(directive(production, "script-src")).toContain("https://*.contentsquare.com");
    expect(directive(production, "script-src")).not.toContain("https://t.contentsquare.net");
  });

  it("keeps the Contentsquare .com domain to scripts only", () => {
    for (const name of ["frame-src", "connect-src", "img-src", "default-src"]) {
      expect(directive(production, name)).not.toContain("contentsquare.com");
    }
  });

  it("lets Contentsquare capture embed a frame", () => {
    expect(directive(production, "frame-src")).toContain("https://*.contentsquare.net");
  });

  it("keeps localhost out of the production connect-src", () => {
    expect(directive(production, "connect-src")).not.toContain("localhost");
    expect(directive(development, "connect-src")).toContain("http://localhost:3000");
    expect(directive(development, "connect-src")).toContain("http://localhost:3001");
  });

  it("lets Google Ads conversion beacons connect", () => {
    // /ccm/s/collect is an XHR, so img-src is not enough; connect-src has to
    // name the DoubleClick host or the conversion is silently dropped.
    expect(directive(production, "connect-src")).toContain("https://ad.doubleclick.net");
    expect(directive(production, "connect-src")).toContain("https://googleads.g.doubleclick.net");
    expect(directive(production, "connect-src")).toContain("https://www.googleadservices.com");
  });

  it("does not loosen any other directive between environments", () => {
    const withoutConnect = (policy: string) =>
      policy.split("; ").filter((entry) => !entry.startsWith("connect-src"));

    expect(withoutConnect(development)).toEqual(withoutConnect(production));
    expect(directive(production, "default-src")).toBe("default-src 'self'");
    expect(directive(production, "object-src")).toBe("object-src 'none'");
  });
});

describe("Contentsquare element ids", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // A duplicate value merges two placements into one Contentsquare element,
  // so the goals bound to them stop being distinguishable.
  it.each([
    ["home", () => <MarketingHome />],
    ["header", () => <SiteHeader />],
    ["integrations", () => <IntegrationsPage />],
    ["trust", () => <TrustPage />],
  ])("gives every measured element on %s a unique id", (_name, element) => {
    const { container } = render(element());

    const ids = overrideIds(container);
    expect(ids.length).toBeGreaterThan(0);
    expect(duplicates(ids)).toEqual([]);
  });

  it.each([["features"], ["pricing"], ["about"], ["faq"]])(
    "gives every measured element on the %s subpage a unique id",
    async (slug) => {
      const page = await MarketingSubpage({ params: Promise.resolve({ slug: [slug] }) });
      const { container } = render(page);

      const ids = overrideIds(container);
      expect(ids.length).toBeGreaterThan(0);
      expect(duplicates(ids)).toEqual([]);
    },
  );

  it("identifies the footer About link, which is no longer in the header nav", () => {
    const { container } = render(<MarketingHome />);

    const about = container.querySelector('[data-cs-override-id="nav-about-footer"]');
    expect(about).not.toBeNull();
    expect(about).toHaveAttribute("href", "/about");
    // The header nav dropped /about, so the old value must not linger anywhere.
    expect(overrideIds(container)).not.toContain("nav-about");
  });

  it("identifies every start-free-trial button on the homepage", () => {
    const { container } = render(<MarketingHome />);

    const ctas = Array.from(container.querySelectorAll("button")).filter((button) =>
      button.textContent?.includes("Start free trial"),
    );

    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas.map((cta) => cta.getAttribute("data-cs-override-id"))).toEqual([
      "cta-start-free-trial-nav",
      "cta-start-free-trial-hero",
      "cta-start-free-trial-pricing-premium",
      "cta-start-free-trial-mid",
      "cta-start-free-trial-footer",
    ]);
  });
});
