import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarketingSubpage from "@/components/marketing/MarketingSubpage";
import { FALLBACK_PRICING } from "@/config/pricing";

describe("financial stress testing landing page", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        price: {
          amount: FALLBACK_PRICING.amount,
          currency: FALLBACK_PRICING.currency,
          interval: FALLBACK_PRICING.interval,
          intervalCount: FALLBACK_PRICING.intervalCount,
        },
      }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("matches retirement-stress-test intent above the fold", async () => {
    const page = await MarketingSubpage({
      params: Promise.resolve({ slug: ["use-cases", "financial-stress-testing"] }),
    });
    const { container } = render(page);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Stress-test your retirement plan before the market tests it.",
    );
    expect(screen.getByText(/market drops, inflation, spending, and different retirement dates/i)).toBeInTheDocument();

    const benefits = screen.getByRole("list", { name: "What you can test in your retirement plan" });
    expect(within(benefits).getByText("Model an early market drop")).toBeInTheDocument();
    expect(within(benefits).getByText("Change inflation and spending")).toBeInTheDocument();
    expect(within(benefits).getByText("Try different retirement dates")).toBeInTheDocument();

    expect(screen.getByText(FALLBACK_PRICING.trialLine)).toBeInTheDocument();
    expect(screen.getByText(/read-only connections.*never used to train ai/i)).toBeInTheDocument();
    const heroCta = container.querySelector<HTMLButtonElement>(
      '[data-cs-override-id="cta-start-free-trial-hero"]',
    );
    expect(heroCta).not.toBeNull();

    (window as typeof window & { dataLayer: Array<Record<string, unknown>> }).dataLayer = [];
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Checkout unavailable in this test" }),
    });
    await userEvent.setup().click(heroCta as HTMLButtonElement);

    expect((window as typeof window & { dataLayer: Array<Record<string, unknown>> }).dataLayer).toContainEqual(
      expect.objectContaining({
        event: "begin_checkout",
        cta_location: "retirement_stress_test_hero",
      }),
    );
  });
});
