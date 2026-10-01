import { render, screen, within } from "@testing-library/react";
import MarketingHome from "@/components/marketing/MarketingHome";

const BADGES: Array<[string, string]> = [
  ["Ask Linc on AlternativeTo", "https://alternativeto.net/software/ask-linc/about/?utm_source=badge&utm_medium=referral"],
  ["Ask Linc approved on SaaSHub", "https://www.saashub.com/ask-linc?utm_source=badge&utm_campaign=badge&utm_content=ask-linc&badge_variant=color&badge_kind=approved"],
  ["Ask Linc featured on There’s An AI For That", "https://theresanaiforthat.com/ai/ask-linc/?ref=featured&v=12845145"],
  ["Ask Linc featured on Uneed", "https://www.uneed.best/tool/ask-linc"],
  ["Ask Linc on Peerlist", "https://peerlist.io/ethanteng/project/ask-linc"],
  ["Ask Linc on PeerPush", "https://peerpush.com/p/ask-linc"],
  ["Ask Linc featured on Smol Launch", "https://smollaunch.com/products/ask-linc?utm_source=badge&utm_medium=referral&utm_campaign=featured&utm_content=ask-linc"],
  ["Ask Linc launched on Tiny Startups", "https://www.tinystartups.com/startup/ask-linc"],
];

describe("homepage directory badges", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sits between the planning flow and the first story chapter", () => {
    const { container } = render(<MarketingHome />);
    const flow = container.querySelector(".story-flow-section");
    const listedOn = screen.getByRole("region", { name: "VERIFIED AND LISTED ON" });

    expect(flow?.nextElementSibling).toBe(listedOn);
    expect(listedOn.nextElementSibling).toHaveAttribute("id", "how-it-works");
  });

  it("links each badge once, in a new tab, with the directory's own tracking params", () => {
    render(<MarketingHome />);
    const listedOn = screen.getByRole("region", { name: "VERIFIED AND LISTED ON" });
    const links = within(listedOn).getAllByRole("link");

    expect(links.map((link) => link.getAttribute("href"))).toEqual(BADGES.map(([, href]) => href));
    for (const [name, href] of BADGES) {
      const link = within(listedOn).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(within(listedOn).getByRole("link", { name: /There’s An AI For That/ })).toHaveAttribute("rel", "nofollow noopener");
  });

  it("keeps the looping copy away from screen readers and the tab order", () => {
    const { container } = render(<MarketingHome />);
    const copies = container.querySelectorAll(".listed-on-list");

    expect(copies).toHaveLength(2);
    expect(copies[0]).not.toHaveAttribute("aria-hidden");
    expect(copies[1]).toHaveAttribute("aria-hidden", "true");
    for (const link of Array.from(copies[1].querySelectorAll("a"))) {
      expect(link).toHaveAttribute("tabindex", "-1");
    }
  });
});
