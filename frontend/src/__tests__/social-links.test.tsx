import { render, screen } from "@testing-library/react";
import LegacySiteFooter from "@/components/SiteFooter";
import { SiteFooter as MarketingSiteFooter } from "@/components/marketing/SiteShell";

const PROFILES: Array<[string, string]> = [
  ["Ask Linc on X", "https://x.com/asklinc"],
  ["Ask Linc on Bluesky", "https://bsky.app/profile/asklinc.com"],
  ["Ask Linc on LinkedIn", "https://www.linkedin.com/company/asklinc/"],
  ["Ask Linc on Facebook", "https://www.facebook.com/asklinc/"],
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

  it("keeps the TAAFT badge as supplied", () => {
    renderFooter();
    const badge = screen.getByRole("link", { name: "Featured on TAAFT" });
    expect(badge).toHaveAttribute("href", "https://theresanaiforthat.com/ai/ask-linc/?ref=social-icon&v=12845145");
    expect(badge.getAttribute("rel")).toContain("nofollow");
    expect(screen.getByAltText("Featured on TAAFT")).toHaveAttribute("src", "https://media.theresanaiforthat.com/social/icon_full.svg");
  });
});
