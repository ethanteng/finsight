import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketingContactForm } from "@/components/marketing/MarketingContactForm";
import MarketingHome from "@/components/marketing/MarketingHome";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import IntegrationsPage from "@/components/marketing/IntegrationsPage";
import { SiteHeader } from "@/components/marketing/SiteShell";
import { USE_CASE_LINKS } from "@/lib/site-nav";

describe("marketing review fixes", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps marketing text at or above the 12px readability floor", () => {
    const css = readFileSync(
      join(process.cwd(), "src/components/marketing/marketing.css"),
      "utf8",
    );
    const declarations = css.match(/font-size:[^;]+;/g) ?? [];
    const undersized = declarations.filter((declaration) =>
      [...declaration.matchAll(/(\d+(?:\.\d+)?)px/g)].some(
        ([, size]) => Number(size) < 12,
      ),
    );

    expect(undersized).toEqual([]);
  });

  it("keeps the desktop sign-in link outside the primary navigation links", () => {
    render(<SiteHeader />);

    const signInLink = screen.getByRole("link", { name: "Sign in" });
    const answersLink = screen.getByRole("link", { name: "Retirement" });
    const compareLink = screen.getByRole("link", { name: "Compare" });
    expect(signInLink).toHaveAttribute("href", "/login");
    expect(signInLink.closest(".nav-actions")).not.toBeNull();
    expect(signInLink.closest(".nav-links")).toBeNull();
    expect(answersLink).toHaveAttribute("href", "/retirement-answers");
    expect(answersLink.closest(".nav-links")).not.toBeNull();
    expect(compareLink).toHaveAttribute("href", "/vs");
    expect(compareLink.closest(".nav-links")).not.toBeNull();
  });

  it("opens an accessible mobile menu with the primary subpages", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const menuButton = screen.getByRole("button", { name: "Open menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await user.click(menuButton);

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    const mobileMenu = screen.getByLabelText("Mobile navigation");
    expect(within(mobileMenu).getByRole("link", { name: "Features" })).toHaveAttribute("href", "/features");
    expect(within(mobileMenu).getByRole("link", { name: "What You Can Ask" })).toHaveAttribute("href", "/use-cases");
    expect(within(mobileMenu).getByRole("link", { name: "Retirement" })).toHaveAttribute("href", "/retirement-answers");
    expect(within(mobileMenu).getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/vs");
    expect(within(mobileMenu).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(mobileMenu).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(within(mobileMenu).getByRole("link", { name: "Sign in to Ask Linc" })).toHaveAttribute("href", "/login");

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Sign in to Ask Linc" })).not.toBeInTheDocument();
  });

  it("leads with checkable financial answers and recognizable life decisions", () => {
    render(<MarketingHome />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ask questions about your money. Get answers you can check.",
    );
    expect(screen.getByText(/connect your accounts and ask in your own words/i)).toBeInTheDocument();
    expect(screen.getByText(/stop trusting financial advice you can't verify/i)).toBeInTheDocument();
    expect(screen.getByText("Your financial accounts")).toBeInTheDocument();
    expect(screen.getByText("Your money question")).toBeInTheDocument();
    expect(screen.getByText("The answer and its math")).toBeInTheDocument();
    expect(screen.getByText(/pasted bank statements into chatgpt and regretted it/i)).toBeInTheDocument();
    expect(USE_CASE_LINKS).toContainEqual({
      href: "/use-cases/family-planning",
      label: "Growing a Family",
    });
  });

  it("shows a read-only product demo visitors can click through", async () => {
    const user = userEvent.setup();
    render(<MarketingHome />);

    expect(screen.getByRole("heading", { name: "See how every answer was worked out." })).toBeInTheDocument();
    expect(screen.getByText("Your numbers")).toBeInTheDocument();
    expect(screen.getByText("What Linc assumed")).toBeInTheDocument();
    expect(screen.getByText("Step-by-step math")).toBeInTheDocument();
    expect(screen.getByText("Built-in checks")).toBeInTheDocument();
    expect(screen.getByText("Up-to-date sources")).toBeInTheDocument();
    const comparison = screen.getByLabelText("Compare a general chatbot answer with Ask Linc");
    const generalDemo = within(comparison).getByLabelText("General-purpose AI answers without connected accounts");
    expect(within(generalDemo).getByText(/retirement planning usually starts/i)).toBeInTheDocument();
    await user.click(within(generalDemo).getByRole("button", { name: /what if inflation stays high/i }));
    expect(within(generalDemo).getByText(/high inflation can raise future spending/i)).toBeInTheDocument();
    await user.click(within(generalDemo).getByRole("button", { name: /how much card debt do i have/i }));
    expect(within(generalDemo).getByText(/list every balance, interest rate, minimum payment/i)).toBeInTheDocument();
    await user.click(within(comparison).getByRole("tab", { name: /ask linc.*all your accounts/i }));
    const demo = screen.getByLabelText("Interactive Ask Linc product demo");
    expect(within(demo).queryByRole("img")).not.toBeInTheDocument();
    expect(within(demo).getByText("Interactive demo using real product output. Identifying details removed.")).toBeInTheDocument();
    expect(within(demo).getByRole("tab", { name: "answer" })).toHaveAttribute("aria-selected", "true");

    await user.click(within(demo).getByRole("tab", { name: "math" }));
    expect(within(demo).getByRole("heading", { name: "Calculations and pipeline" })).toBeInTheDocument();
    expect(within(demo).getByRole("button", { name: "Canonical facts and provenance −" })).toHaveAttribute("aria-expanded", "true");

    await user.click(within(demo).getByRole("tab", { name: "sources" }));
    expect(within(demo).getByRole("heading", { name: "Supporting evidence" })).toBeInTheDocument();
    await user.click(within(demo).getByRole("button", { name: /market news history/i }));
    expect(within(demo).getByText("Current inflation and market context")).toBeInTheDocument();

    await user.click(within(demo).getByRole("button", { name: "Finances" }));
    expect(within(demo).getByRole("heading", { name: "Your finances" })).toBeInTheDocument();
    await user.click(within(demo).getByRole("button", { name: "Accounts & context" }));
    expect(within(demo).getByRole("heading", { name: "Investment Portfolio" })).toBeInTheDocument();
    await user.click(within(demo).getByRole("tab", { name: "Holdings" }));
    expect(within(demo).getByRole("heading", { name: "Holdings by category" })).toBeInTheDocument();

    await user.click(within(demo).getByRole("button", { name: "Decisions" }));
    await user.click(within(demo).getByRole("button", { name: /ask follow-up/i }));
    expect(within(demo).getByText(/question asking is disabled in this demo/i)).toBeInTheDocument();
    expect(screen.queryByText(/calculation engine does the math/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /real answers, not generic advice/i })).toBeInTheDocument();
    expect(screen.getByText("A GENERAL CHATBOT")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /no accounts.*general guidance/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /all your accounts.*answers you can check/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /facts behind the answer/i })).toBeInTheDocument();
    ["Plaid", "SnapTrade", "RentCast", "FRED", "FMP", "Tiingo"].forEach((provider) => {
      expect(screen.getByText(provider)).toBeInTheDocument();
    });
    expect(screen.getByText("Bank balances, cards, loans, and transactions")).toBeInTheDocument();
    expect(screen.getByText("Brokerage and retirement holdings, balances, and trades")).toBeInTheDocument();
    expect(screen.getByText("Home values and local property data")).toBeInTheDocument();
    expect(screen.getByText("Inflation, interest rates, and other economic data")).toBeInTheDocument();
    expect(screen.getByText("Company financials, stock prices, and market data")).toBeInTheDocument();
    expect(screen.getByText("Current and historical prices for stocks and funds")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see what ask linc can connect/i })).toHaveAttribute("href", "/integrations");
    expect(screen.getByRole("heading", { name: /financial data is never used to train ai models/i })).toBeInTheDocument();
    expect(screen.getByText(/no toggle.*no opt-out.*financial data stays yours/i)).toBeInTheDocument();
    expect(screen.queryByText("THE DIFFERENCE")).not.toBeInTheDocument();
    expect(screen.queryByText("LINC'S REASONING")).not.toBeInTheDocument();
  });

  it("cycles the decision demo tabs and stops after a visitor takes control", () => {
    const OriginalIntersectionObserver = global.IntersectionObserver;
    global.IntersectionObserver = class VisibleIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0.35];
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    } as typeof IntersectionObserver;
    jest.useFakeTimers();

    try {
      render(<MarketingHome />);
      fireEvent.click(screen.getByRole("tab", { name: /ask linc.*all your accounts/i }));
      const demo = screen.getByLabelText("Interactive Ask Linc product demo");
      const answerTab = within(demo).getByRole("tab", { name: "answer" });
      const mathTab = within(demo).getByRole("tab", { name: "math" });
      const sourcesTab = within(demo).getByRole("tab", { name: "sources" });

      act(() => jest.advanceTimersByTime(4300));
      expect(mathTab).toHaveAttribute("data-auto-click", "true");

      act(() => jest.advanceTimersByTime(260));
      expect(mathTab).toHaveAttribute("aria-selected", "true");

      act(() => jest.advanceTimersByTime(460));
      act(() => jest.advanceTimersByTime(4300));
      expect(sourcesTab).toHaveAttribute("data-auto-click", "true");
      act(() => jest.advanceTimersByTime(260));
      expect(sourcesTab).toHaveAttribute("aria-selected", "true");

      fireEvent.click(answerTab);
      act(() => jest.advanceTimersByTime(10000));
      expect(answerTab).toHaveAttribute("aria-selected", "true");
    } finally {
      jest.useRealTimers();
      global.IntersectionObserver = OriginalIntersectionObserver;
    }
  });

  it("advances from general advice to the Ask Linc demo and yields to manual selection", () => {
    const OriginalIntersectionObserver = global.IntersectionObserver;
    global.IntersectionObserver = class VisibleComparisonObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0.35];
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    } as typeof IntersectionObserver;
    jest.useFakeTimers();

    try {
      render(<MarketingHome />);
      const comparison = screen.getByLabelText("Compare a general chatbot answer with Ask Linc");
      const generalTab = within(comparison).getByRole("tab", { name: /general chatbot.*no accounts/i });
      const lincTab = within(comparison).getByRole("tab", { name: /ask linc.*all your accounts/i });
      expect(generalTab).toHaveAttribute("aria-selected", "true");

      act(() => jest.advanceTimersByTime(5200));
      expect(lincTab).toHaveAttribute("data-auto-click", "true");
      act(() => jest.advanceTimersByTime(260));
      expect(lincTab).toHaveAttribute("aria-selected", "true");
      expect(within(comparison).getByLabelText("Interactive Ask Linc product demo")).toBeInTheDocument();

      fireEvent.click(generalTab);
      act(() => jest.advanceTimersByTime(10000));
      expect(generalTab).toHaveAttribute("aria-selected", "true");
    } finally {
      jest.useRealTimers();
      global.IntersectionObserver = OriginalIntersectionObserver;
    }
  });

  it("explains the connected financial picture on the features page without exposing a raw provider dump", async () => {
    const page = await MarketingSubpage({ params: Promise.resolve({ slug: ["features"] }) });
    render(page);

    expect(screen.getByRole("heading", { name: /bring the whole money picture into one answer/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts and cash flow" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Investments and retirement accounts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Property value" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rates and the economy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Long-term market history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Current rules and news" })).toBeInTheDocument();
    expect(screen.getByText(/nearby comparable homes/i)).toBeInTheDocument();
    expect(screen.getByText(/fund fees and where your money is invested/i)).toBeInTheDocument();
    expect(screen.getByText(/important numbers stay tied to their sources/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see what linc can connect and use/i })).toHaveAttribute("href", "/integrations");
  });

  it("presents integrations as a user-facing money picture", () => {
    render(<IntegrationsPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your finances live in many places. Your answer shouldn't.",
    );
    expect(screen.getByRole("heading", { name: "Cash flow, cards, and loans" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "See what you own and where the risk is" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The parts that do not live at a bank" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rates and borrowing costs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Long-term market history" })).toBeInTheDocument();
    expect(screen.getByText(/dated home-value estimate and range/i)).toBeInTheDocument();
    expect(screen.getByText(/fund fees and where each fund invests/i)).toBeInTheDocument();
    expect(screen.getByText(/does not use every available data point just because it can/i)).toBeInTheDocument();
    const integrationsTable = screen.getByRole("table", {
      name: /ask linc integrations, the financial data used from each source, and example questions/i,
    });
    expect(within(integrationsTable).getAllByRole("row")).toHaveLength(11);
    [
      "Plaid",
      "SnapTrade",
      "Financial Modeling Prep",
      "Tiingo",
      "FRED",
      "Kenneth French Data Library",
      "Robert Shiller",
      "Massive",
      "Brave Search",
      "RentCast",
    ].forEach((integration) => expect(within(integrationsTable).getByText(integration)).toBeInTheDocument());
    expect(within(integrationsTable).getByText(/what is the current ira contribution limit/i)).toBeInTheDocument();
    expect(within(integrationsTable).getByText(/what is my home worth, how uncertain is that estimate/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see how your data is protected/i })).toHaveAttribute("href", "/how-we-protect-your-data");
  });

  it("submits the redesigned contact form through the existing API", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    render(<MarketingContactForm />);
    await user.type(screen.getByLabelText("FIRST NAME"), "Ethan");
    await user.type(screen.getByLabelText("EMAIL"), "ethan@example.com");
    await user.selectOptions(screen.getByLabelText("WHAT CAN WE HELP WITH?"), "Technical support");
    await user.type(screen.getByLabelText("MESSAGE"), "The app is not loading for me.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(options.body);

    expect(url).toBe("http://localhost:3000/auth/contact");
    expect(options).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(payload).toEqual({
      email: "ethan@example.com",
      message: "Name: Ethan\nTopic: Technical support\n\nThe app is not loading for me.",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Thanks for reaching out.");
  });

  it("shows API failures without discarding the form", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: "Failed to send contact message" }),
    });

    render(<MarketingContactForm />);
    await user.type(screen.getByLabelText("EMAIL"), "ethan@example.com");
    await user.type(screen.getByLabelText("MESSAGE"), "Please help with my account.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to send contact message");
    expect(screen.getByLabelText("MESSAGE")).toHaveValue("Please help with my account.");
  });
});
