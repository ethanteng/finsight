import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import AnswerPage from "@/components/marketing/AnswerPage";
import MarketingHome from "@/components/marketing/MarketingHome";
import UseCasesRoute from "@/app/use-cases/page";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteShell";
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

  it("sends every site-wide Coast FIRE link to the one calculator page", () => {
    expect(PRIMARY_NAV_LINKS.find((link) => link.label === "Coast FIRE")?.href)
      .toBe("/coast-fire-calculator");

    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Coast FIRE" }))
      .toHaveAttribute("href", "/coast-fire-calculator");
    expect(screen.getByRole("link", { name: "Retirement" }))
      .toHaveAttribute("href", "/retirement-calculator");
  });

  it("sends homepage and use-case entries to the right free calculators", () => {
    const { unmount } = render(<MarketingHome />);
    expect(screen.getByRole("link", { name: /calculate my coast fire number/i }))
      .toHaveAttribute("href", "/coast-fire-calculator");
    // By the card's own text, so a header or footer link cannot satisfy this.
    expect(screen.getByRole("link", { name: /04 \/ RETIRE/ }))
      .toHaveAttribute("href", "/retirement-calculator");
    unmount();

    render(<UseCasesRoute />);
    expect(screen.getByRole("link", { name: /01 \/ COAST FIRE & OPTIONALITY/ }))
      .toHaveAttribute("href", "/coast-fire-calculator");
    expect(screen.getByRole("link", { name: /02 \/ RETIREMENT/ }))
      .toHaveAttribute("href", "/retirement-calculator");
  });

  it("puts Retirement in the header nav, desktop and mobile alike", async () => {
    expect(PRIMARY_NAV_LINKS.find((link) => link.label === "Retirement")?.href)
      .toBe("/retirement-calculator");

    const user = userEvent.setup();
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Retirement" }))
      .toHaveAttribute("href", "/retirement-calculator");

    // The mobile menu renders the same list, so the link cannot be desktop-only.
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const panel = screen.getByLabelText("Mobile navigation");
    expect(within(panel).getByRole("link", { name: /Retirement/ }))
      .toHaveAttribute("href", "/retirement-calculator");
  });

  it("offers full retirement as the secondary path out of the homepage Coast FIRE card", () => {
    render(<MarketingHome />);

    const card = screen.getByLabelText("From a free Coast FIRE number to a stress-tested plan")
      .closest("section") as HTMLElement;
    expect(within(card).getByRole("link", { name: "Stress-test full retirement" }))
      .toHaveAttribute("href", "/retirement-calculator");
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
