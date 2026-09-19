import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AboutPageRoute from "@/app/about/page";
import FeaturesPageRoute from "@/app/features/page";
import { MarketingContactForm } from "@/components/marketing/MarketingContactForm";
import MarketingHome from "@/components/marketing/MarketingHome";
import HeroScreenshotCarousel from "@/components/marketing/HeroScreenshotCarousel";
import RotatingHeroExamples from "@/components/marketing/RotatingHeroExamples";
import StaticProductDemo from "@/components/marketing/StaticProductDemo";
import { TRIAL_CTA_MICROCOPY } from "@/components/marketing/trial-copy";
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
    const css = ["marketing.css", "marketing-responsive.css", "coast-fire.css"]
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
    const css = ["marketing.css", "marketing-responsive.css", "coast-fire.css"]
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
      ".coast-fire-page .cf-hero-sub",
      ".coast-fire-page .cf-form-note",
      ".coast-fire-page .cf-faq details > p",
    ];

    for (const selector of representativeBodyCopy) {
      expect(finalFontSize(selector)).toBeGreaterThanOrEqual(14);
    }
  });

  it("keeps the desktop sign-in link outside the primary navigation links", () => {
    render(<SiteHeader />);

    const signInLink = screen.getByRole("link", { name: "Sign in" });
    const coastFireLink = screen.getByRole("link", { name: "Coast FIRE" });
    const compareLink = screen.getByRole("link", { name: "Compare" });
    expect(signInLink).toHaveAttribute("href", "/login");
    expect(signInLink.closest(".nav-actions")).not.toBeNull();
    expect(signInLink.closest(".nav-links")).toBeNull();
    expect(coastFireLink).toHaveAttribute("href", "/coast-fire-calculator");
    expect(coastFireLink.closest(".nav-links")).not.toBeNull();
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
    expect(within(mobileMenu).getByRole("link", { name: "Coast FIRE" })).toHaveAttribute("href", "/coast-fire-calculator");
    expect(within(mobileMenu).getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/vs");
    expect(within(mobileMenu).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(mobileMenu).queryByRole("link", { name: "About" })).not.toBeInTheDocument();
    expect(within(mobileMenu).getByRole("link", { name: "Sign in to Ask Linc" })).toHaveAttribute("href", "/login");

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Sign in to Ask Linc" })).not.toBeInTheDocument();
  });

  it("leads with the question and a compact visual journey, with links to deeper content", async () => {
    const user = userEvent.setup();
    render(<MarketingHome />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tell Linc what you’re trying to figure out. It builds the financial plan.");
    expect(screen.getByText(TRIAL_CTA_MICROCOPY)).toBeInTheDocument();
    expect(screen.getByLabelText("Connect, ask, Linc does the work, explore your plan")).toBeInTheDocument();
    expect(screen.queryByLabelText("Interactive Ask Linc product demo")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /explore the full demo/i })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("link", { name: /see what you can ask/i })).toHaveAttribute("href", "/use-cases");
    expect(screen.getByRole("heading", { name: /change the assumption.*not the spreadsheet/i })).toBeInTheDocument();
    expect(screen.getByText("90.5%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Age 57" }));
    expect(screen.getByRole("button", { name: "Age 57" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/685 of 685 tested histories/i)).toBeInTheDocument();
    expect(screen.getByText(/same travel budget. more breathing room/i)).toBeInTheDocument();
    expect(USE_CASE_LINKS).toContainEqual({ href: "/use-cases/career-change", label: "Career Change & Time Off" });
  });

  it("rotates product screenshots in the reusable carousel and lets visitors choose one", () => {
    const OriginalIntersectionObserver = global.IntersectionObserver;
    global.IntersectionObserver = class VisibleHeroObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0.25];
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
      render(<HeroScreenshotCarousel />);
      const shots = screen.getByLabelText("Ask Linc product screenshots");
      expect(within(shots).getByText("ASK LINC ·", { exact: false })).toHaveTextContent("DECISION WORKSPACE");
      expect(within(shots).getByText(/ask what you are trying to decide/i)).toBeInTheDocument();

      act(() => jest.advanceTimersByTime(4500));
      expect(within(shots).getByText(/what the numbers mean for you/i)).toBeInTheDocument();

      act(() => jest.advanceTimersByTime(4500));
      expect(within(shots).getByText(/cash, investments, property, and debt/i)).toBeInTheDocument();

      // Pointing at the card holds the current slide.
      fireEvent.pointerEnter(shots);
      expect(shots).toHaveAttribute("data-paused", "true");
      act(() => jest.advanceTimersByTime(9000));
      expect(within(shots).getByText(/cash, investments, property, and debt/i)).toBeInTheDocument();

      fireEvent.pointerLeave(shots);
      expect(shots).not.toHaveAttribute("data-paused");

      // The stop control is the pointer-free way to hold it, and it survives
      // the pointer leaving.
      const toggle = within(shots).getByRole("button", { name: "Pause" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      act(() => toggle.click());
      expect(within(shots).getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "true");
      fireEvent.pointerEnter(shots);
      fireEvent.pointerLeave(shots);
      expect(shots).toHaveAttribute("data-paused", "true");
      act(() => jest.advanceTimersByTime(9000));
      expect(within(shots).getByText(/cash, investments, property, and debt/i)).toBeInTheDocument();

      act(() => within(shots).getByRole("button", { name: "Play" }).click());
      expect(shots).not.toHaveAttribute("data-paused");
    } finally {
      jest.useRealTimers();
      global.IntersectionObserver = OriginalIntersectionObserver;
    }
  });

  it("rotates realistic hero answers in the reusable example and lets visitors choose an example", () => {
    const OriginalIntersectionObserver = global.IntersectionObserver;
    global.IntersectionObserver = class VisibleHeroObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0.25];
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
      render(<RotatingHeroExamples />);
      const examples = screen.getByLabelText("Realistic Ask Linc answer examples");
      // Every example stays in the DOM so the card reserves the tallest one and
      // does not resize as it rotates, so asserting presence would pass even if
      // rotation broke. data-active is what actually shows.
      const shown = () =>
        [...examples.querySelectorAll('.hero-example-stack > p')]
          .find((p) => p.getAttribute("data-active") === "true")?.textContent ?? "";

      expect(shown()).toMatch(/stress-tested 49 overlapping historical 37-year windows/i);

      act(() => jest.advanceTimersByTime(9000));
      expect(shown()).toMatch(/a 15% down payment is \$105K/i);

      act(() => {
        within(examples).getByRole("button", { name: "Show Family leave example" }).click();
      });
      expect(shown()).toMatch(/the gap is about \$3,750 a month/i);
      expect(within(examples).getByRole("button", { name: "Show Family leave example" })).toHaveAttribute("aria-current", "true");
      expect(examples).toHaveAttribute("data-paused", "true");
    } finally {
      jest.useRealTimers();
      global.IntersectionObserver = OriginalIntersectionObserver;
    }
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

  it("shows the full product demo with working navigation and evidence tabs", async () => {
    const user = userEvent.setup();
    render(<StaticProductDemo />);

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
      render(<StaticProductDemo />);
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

  it("explains the three-step workflow and links to the evidence", () => {
    render(<FeaturesPageRoute />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You bring the question. Linc brings it together.");
    const steps = screen.getByRole("list", { name: "How Ask Linc builds an answer" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(within(steps).getByText("Connect your financial life")).toBeInTheDocument();
    expect(within(steps).getByText("Change an assumption")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /explore accounts & data/i })).toHaveAttribute("href", "/integrations");
  });

  it("explains account connections and retains provider transparency", () => {
    render(<IntegrationsPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your financial life. Finally together.");
    expect(screen.getByRole("heading", { name: "Connect what matters to you." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Know where the numbers come from." })).toBeInTheDocument();
    ["Plaid", "SnapTrade", "RentCast", "FRED + Massive", "FMP + Tiingo", "Kenneth French + Robert Shiller"].forEach((source) => {
      expect(screen.getByRole("heading", { name: source })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /see how the answer is checked/i })).toHaveAttribute("href", "/trust");
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
