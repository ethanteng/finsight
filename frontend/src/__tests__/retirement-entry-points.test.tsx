import { render, screen, within } from "@testing-library/react";
import AnswerPage from "@/components/marketing/AnswerPage";
import MarketingHome from "@/components/marketing/MarketingHome";
import UseCasesRoute from "@/app/use-cases/page";
import { SiteFooter } from "@/components/marketing/SiteShell";
import {
  canIRetireAt55,
  canIRetireAt60,
  canIRetireWithOneMillion,
  canIRetireWithThreeMillion,
  canIRetireWithTwoMillion,
  type AnswerPageData,
} from "@/lib/answer-pages";
import { PRIMARY_NAV_LINKS } from "@/lib/site-nav";

/**
 * Where "retirement" sends a visitor across the marketing site. The calculator
 * is the destination someone can act on, so the site-wide entries lead there;
 * the guides hub stays reachable from the answer pages' own breadcrumbs.
 */
describe("retirement entry points", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends both site-wide Retirement links to the calculator", () => {
    expect(PRIMARY_NAV_LINKS.find((link) => link.label === "Retirement")?.href)
      .toBe("/retirement-calculator");

    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Retirement" }))
      .toHaveAttribute("href", "/retirement-calculator");
  });

  it("sends the retirement card on the homepage and the use-cases hub to the calculator", () => {
    const { unmount } = render(<MarketingHome />);
    // By the card's own text, so a header or footer link cannot satisfy this.
    expect(screen.getByRole("link", { name: /04 \/ RETIRE/ }))
      .toHaveAttribute("href", "/retirement-calculator");
    unmount();

    render(<UseCasesRoute />);
    const tile = screen.getByRole("link", { name: /01 \/ RETIREMENT/ });
    expect(tile).toHaveAttribute("href", "/retirement-calculator");
  });

  function readinessHref(page: AnswerPageData) {
    render(<AnswerPage page={page} />);
    const card = screen.getByRole("link", { name: /Check your retirement readiness/ });
    return card.getAttribute("href");
  }

  it("prefills the calculator with the age the guide is about", () => {
    expect(readinessHref(canIRetireAt55)).toBe("/retirement-calculator?retirement_age=55");
  });

  it("prefills age 60 from the age-60 guide", () => {
    expect(readinessHref(canIRetireAt60)).toBe("/retirement-calculator?retirement_age=60");
  });

  it("sends the balance guides to the bare calculator, having no age to pass", () => {
    for (const page of [canIRetireWithOneMillion, canIRetireWithTwoMillion, canIRetireWithThreeMillion]) {
      const { unmount } = render(<AnswerPage page={page} />);
      expect(screen.getByRole("link", { name: /Check your retirement readiness/ }))
        .toHaveAttribute("href", "/retirement-calculator");
      unmount();
    }
  });

  it("keeps the guides hub reachable from each answer page's breadcrumb", () => {
    render(<AnswerPage page={canIRetireAt55} />);
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" }))
      .getByRole("link", { name: "Retirement" })).toHaveAttribute("href", "/retirement-answers");
  });
});
