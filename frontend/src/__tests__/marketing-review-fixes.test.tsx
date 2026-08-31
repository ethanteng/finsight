import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AboutPageRoute from "@/app/about/page";
import FeaturesPageRoute from "@/app/features/page";
import { MarketingContactForm } from "@/components/marketing/MarketingContactForm";
import MarketingHome from "@/components/marketing/MarketingHome";
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
    const css = ["marketing.css", "marketing-responsive.css"]
      .map((file) => readFileSync(join(process.cwd(), "src/components/marketing", file), "utf8"))
      .join("\n");
    const declarations = css.match(/font-size:[^;]+;/g) ?? [];
    const undersized = declarations.filter((declaration) =>
      [...declaration.matchAll(/(\d+(?:\.\d+)?)px/g)].some(
        ([, size]) => Number(size) < 12,
      ),
    );

    expect(undersized).toEqual([]);
  });

  it("keeps substantive marketing copy readable at normal zoom", () => {
    const css = ["marketing.css", "marketing-responsive.css"]
      .map((file) => readFileSync(join(process.cwd(), "src/components/marketing", file), "utf8"))
      .join("\n");
    const finalFontSize = (selector: string) => {
      let size: number | undefined;

      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = match[1].split(",").map((value) => value.trim());
        if (!selectors.includes(selector)) continue;
        const declaration = match[2].match(/font-size:\s*(\d+)px(?:\s*!important)?/);
        if (declaration) size = Number(declaration[1]);
      }

      return size;
    };

    const representativeBodyCopy = [
      ".feature-bento p",
      ".integration-principles small",
      ".trust-pipeline-grid p",
      ".belief-grid p",
      ".comparison-row b",
      ".post-grid > article > p",
      ".answer-hub-card > p",
      ".demo-answer-list li",
      ".footer-inner > div:first-child p",
    ];

    for (const selector of representativeBodyCopy) {
      expect(finalFontSize(selector)).toBeGreaterThanOrEqual(14);
    }
  });

  it("keeps the desktop sign-in link outside the primary navigation links", () => {
    render(<SiteHeader />);

    const signInLink = screen.getByRole("link", { name: "Sign in" });
    const retirementLink = screen.getByRole("link", { name: "Retirement" });
    const compareLink = screen.getByRole("link", { name: "Compare" });
    expect(signInLink).toHaveAttribute("href", "/login");
    expect(signInLink.closest(".nav-actions")).not.toBeNull();
    expect(signInLink.closest(".nav-links")).toBeNull();
    expect(retirementLink).toHaveAttribute("href", "/retirement-answers");
    expect(retirementLink.closest(".nav-links")).not.toBeNull();
    expect(compareLink).toHaveAttribute("href", "/vs");
    expect(compareLink.closest(".nav-links")).not.toBeNull();
  });

  it("opens an accessible mobile menu with the current primary subpages", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const menuButton = screen.getByRole("button", { name: "Open menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await user.click(menuButton);

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    const mobileMenu = screen.getByLabelText("Mobile navigation");
    expect(within(mobileMenu).getByRole("link", { name: "How It Works" })).toHaveAttribute("href", "/features");
    expect(within(mobileMenu).getByRole("link", { name: "What You Can Ask" })).toHaveAttribute("href", "/use-cases");
    expect(within(mobileMenu).getByRole("link", { name: "Retirement" })).toHaveAttribute("href", "/retirement-answers");
    expect(within(mobileMenu).getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/vs");
    expect(within(mobileMenu).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(mobileMenu).queryByRole("link", { name: "About" })).not.toBeInTheDocument();
    expect(within(mobileMenu).getByRole("link", { name: "Sign in to Ask Linc" })).toHaveAttribute("href", "/login");

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Sign in to Ask Linc" })).not.toBeInTheDocument();
  });

  it("leads with the decision-first positioning and recognizable life decisions", () => {
    render(<MarketingHome />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "See what a big money decision changes. Before you make it.",
    );
    expect(screen.getByText(/linc tests the decision against the rest of your financial life/i)).toBeInTheDocument();
    expect(screen.getByText("Start with the decision")).toBeInTheDocument();
    expect(screen.getByText("Your whole financial picture")).toBeInTheDocument();
    expect(screen.getAllByText("Show the Math").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Can we afford this home without becoming house poor?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Can I take a year off without setting retirement back?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /linc finds what could change the answer/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The right numbers for this decision." })).not.toBeInTheDocument();
    expect(USE_CASE_LINKS).toContainEqual({
      href: "/use-cases/career-change",
      label: "Career Change & Time Off",
    });
  });

  it("uses the stylized founder portrait on the About page", () => {
    render(<AboutPageRoute />);

    const portrait = screen.getByRole("img", { name: "Stylized portrait of Ethan Teng" });
    expect(portrait).toHaveAttribute("src", expect.stringContaining("ethan-teng-cartoon.webp"));
    expect(portrait).not.toHaveAttribute("src", expect.stringContaining("ethan-teng.jpg"));
    expect(screen.getByRole("heading", { name: /it started with a layoff.*and a bad idea/i })).toBeInTheDocument();
    expect(screen.getByText(/after i got laid off, i pasted my bank statements into chatgpt to figure out/i)).toHaveTextContent("how long my savings would last without a job.");
    expect(screen.getByText("WHERE IT BROKE")).toBeInTheDocument();
    expect(screen.getByText("WHAT I NEEDED")).toBeInTheDocument();
    expect(screen.getByText(/35 of 100 ChatGPT Search finance answers/i)).toHaveTextContent("more than $500K short");
    expect(screen.getByRole("link", { name: /read the analysis/i })).toHaveAttribute("href", "/blog/ai-financial-calculator");
    expect(screen.getByText("THE RESULT")).toBeInTheDocument();
    expect(screen.getByText("So I built Ask Linc.")).toBeInTheDocument();
  });

  it("shows the interactive static product demo directly on the homepage", async () => {
    const user = userEvent.setup();
    render(<MarketingHome />);

    expect(screen.getByRole("heading", { name: "Start with a real question. Follow the answer." })).toBeInTheDocument();
    const demo = screen.getByLabelText("Interactive Ask Linc product demo");
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
  });

  it("cycles the decision demo tabs and stops after a visitor takes control", () => {
    const OriginalIntersectionObserver = global.IntersectionObserver;
    global.IntersectionObserver = class VisibleIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0.15];
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

      act(() => answerTab.click());
      act(() => jest.advanceTimersByTime(10000));
      expect(answerTab).toHaveAttribute("aria-selected", "true");
    } finally {
      jest.useRealTimers();
      global.IntersectionObserver = OriginalIntersectionObserver;
    }
  });

  it("explains the decision workflow on the How It Works page", () => {
    render(<FeaturesPageRoute />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Financial planning that starts with your question.",
    );
    expect(screen.getByRole("heading", { name: "One question. Five clear steps." })).toBeInTheDocument();
    expect(screen.getByText("Ask the question")).toBeInTheDocument();
    expect(screen.getByText("Linc pulls in what matters")).toBeInTheDocument();
    expect(screen.getByText("Compare the tradeoffs")).toBeInTheDocument();
    expect(screen.getByText("Get the recommendation")).toBeInTheDocument();
    expect(screen.getByText("Check the work")).toBeInTheDocument();
    const sampleAnswer = screen.getByText(/can we afford a \$700k home without pausing retirement savings/i).closest("article");
    expect(sampleAnswer).not.toBeNull();
    expect(within(sampleAnswer as HTMLElement).getByRole("link", { name: /show the math/i })).toHaveClass("miniature-math-link");
    expect(screen.getByRole("heading", { name: "Cash, spending, and debt" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Investments, property, and goals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rates, rules, and markets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /explore accounts & data/i })).toHaveAttribute("href", "/integrations");
    expect(screen.queryByRole("link", { name: /see how answers are checked/i })).not.toBeInTheDocument();
  });

  it("presents accounts and data as inputs to the decision instead of a provider catalog", () => {
    render(<IntegrationsPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your finances live in many places. Your answer shouldn't.",
    );
    expect(screen.getByRole("heading", { name: "Linc pulls in what could change the answer." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cash, spending, and debt" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Investments, property, and goals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What is true now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Different decisions need different facts." })).toBeInTheDocument();
    expect(screen.getByText("Can I take a year off without setting retirement back?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connected accounts, property, markets, and current information." })).toBeInTheDocument();
    ["Plaid", "SnapTrade", "RentCast", "FRED + Massive", "FMP + Tiingo", "Kenneth French + Robert Shiller"].forEach((source) => {
      expect(screen.getByRole("heading", { name: source })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /see how the answer is checked/i })).toHaveAttribute("href", "/trust");
    expect(screen.queryByRole("link", { name: /see how your data is protected/i })).not.toBeInTheDocument();
  });

  it("keeps light provider cards readable and responsive", () => {
    const css = readFileSync(
      join(process.cwd(), "src/components/marketing/marketing-responsive.css"),
      "utf8",
    );

    expect(css).toMatch(/\.integration-inventory-section \.coverage-card \{/);
    expect(css).toMatch(/\.integration-inventory-section \.coverage-card h3 \{[\s\S]*color: var\(--ink\)/);
    expect(css).toMatch(/grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-width: 980px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.integration-inventory-section \.coverage-grid \{[\s\S]*grid-template-columns: 1fr/);
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
