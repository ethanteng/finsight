import { render, screen } from "@testing-library/react";
import LegacySiteFooter from "@/components/SiteFooter";
import { SiteFooter as MarketingSiteFooter } from "@/components/marketing/SiteShell";

const PROFILES: Array<[string, string]> = [
  ["Ask Linc on X", "https://x.com/asklinc"],
  ["Ask Linc on Bluesky", "https://bsky.app/profile/asklinc.com"],
  ["Ask Linc on LinkedIn", "https://www.linkedin.com/company/asklinc/"],
  ["Ask Linc on Facebook", "https://www.facebook.com/asklinc/"],
  ["Ask Linc on Instagram", "https://www.instagram.com/asklinc/"],
  ["Ask Linc on YouTube", "https://www.youtube.com/@asklinc"],
];

describe.each([
  ["marketing footer", () => render(<MarketingSiteFooter />)],
  ["legacy footer", () => render(<LegacySiteFooter />)],
])("social links in the %s", (_name, renderFooter) => {
  it("links every profile in a new tab", () => {
    renderFooter();
    for (const [name, href] of PROFILES) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("shows the profiles in order", () => {
    renderFooter();
    const names = screen
      .getAllByRole("link", { name: /^Ask Linc on / })
      .map((link) => link.getAttribute("aria-label"));
    expect(names).toEqual(PROFILES.map(([name]) => name));
  });
});
