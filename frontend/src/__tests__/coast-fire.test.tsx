import { fireEvent, render, screen } from "@testing-library/react";
import { CoastFireCalculator } from "@/components/marketing/CoastFireCalculator";
import { CoastFireCalculatorSeoContent } from "@/components/marketing/CoastFireCalculatorSeoContent";
import { metadata as calculatorMetadata } from "@/app/coast-fire-calculator/page";
import {
  calculateCoastFire,
  COAST_FIRE_FAQ,
  DEFAULT_COAST_FIRE_INPUTS,
} from "@/lib/coast-fire";
import {
  pushCoastFireCalculated,
  pushCoastFireResultsEmailed,
  pushStartFreeClick,
} from "@/lib/dataLayer";
import {
  readCoastFireSignupContext,
  COAST_FIRE_SIGNUP_HREF,
} from "@/lib/coast-fire-signup-context";

jest.mock("@/lib/dataLayer", () => ({
  pushCoastFireCalculated: jest.fn(),
  pushCoastFireResultsEmailed: jest.fn(),
  pushStartFreeClick: jest.fn(),
}));

describe("Coast FIRE calculation", () => {
  it("backs the retirement target into a number needed today", () => {
    const result = calculateCoastFire(DEFAULT_COAST_FIRE_INPUTS);

    expect(result.portfolioSpendingNeed).toBe(50_000);
    expect(result.retirementTarget).toBe(1_250_000);
    expect(result.coastFireNumber).toBeCloseTo(369_128, 0);
    expect(result.projectedSavingsAtRetirement).toBeCloseTo(1_354_542, 0);
    expect(result.hasReachedCoastFire).toBe(true);
  });

  it("reports a gap when current savings are below the Coast FIRE number", () => {
    const result = calculateCoastFire({ ...DEFAULT_COAST_FIRE_INPUTS, currentSavings: 300_000 });

    expect(result.hasReachedCoastFire).toBe(false);
    expect(result.differenceToday).toBeCloseTo(-69_128, 0);
    expect(result.differenceAtRetirement).toBeLessThan(0);
  });

  it("requires no portfolio when income available at retirement covers spending", () => {
    const result = calculateCoastFire({
      ...DEFAULT_COAST_FIRE_INPUTS,
      annualRetirementIncome: DEFAULT_COAST_FIRE_INPUTS.annualRetirementSpending,
    });

    expect(result.retirementTarget).toBe(0);
    expect(result.coastFireNumber).toBe(0);
    expect(result.hasReachedCoastFire).toBe(true);
  });

  it("rejects a retirement age that is not in the future", () => {
    expect(() => calculateCoastFire({
      ...DEFAULT_COAST_FIRE_INPUTS,
      retirementAge: DEFAULT_COAST_FIRE_INPUTS.currentAge,
    })).toThrow(/after your current age/i);
  });
});

describe("Coast FIRE calculator page", () => {
  const originalAnimationFrame = global.requestAnimationFrame;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    window.history.replaceState({}, "", "/coast-fire-calculator");
    window.sessionStorage.clear();
    global.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    Element.prototype.scrollIntoView = jest.fn();
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.requestAnimationFrame = originalAnimationFrame;
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("opens with editable inputs and a useful result", () => {
    render(<CoastFireCalculator />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Have I reached Coast FIRE?");
    expect(screen.getByLabelText("Your age today")).toHaveValue(40);
    // Grouped, because a money box is text: 400000 is a run of zeros to check.
    expect(screen.getByLabelText("Retirement savings today")).toHaveValue("400,000");
    expect(screen.getAllByText("$369,128").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "You’ve reached Coast FIRE." })).toBeInTheDocument();
  });

  it("recalculates a not-yet result and tracks only the outcome", () => {
    const { container } = render(<CoastFireCalculator />);

    fireEvent.change(screen.getByLabelText("Retirement savings today"), { target: { value: "100000" } });
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByRole("heading", { name: "You’re still building your coast." })).toBeInTheDocument();
    expect(screen.getByText(/short of your Coast FIRE number today/i)).toBeInTheDocument();
    expect(pushCoastFireCalculated).toHaveBeenCalledWith("not_yet", 25, "submitted");
    expect(JSON.stringify(jest.mocked(pushCoastFireCalculated).mock.calls)).not.toContain("100000");
  });

  /*
   * The scorecard counts a plan CTA only when a result is timestamped ahead of
   * it, and this page shows its default scenario before anyone submits.
   */
  /*
   * `type="number"` cannot show grouping, so the money boxes are text. The
   * figure a visitor is most likely to mistype is the one with the most
   * zeros in it.
   */
  it("groups money as it is typed, and reads the grouped figure back", () => {
    const { container } = render(<CoastFireCalculator />);
    const savings = screen.getByLabelText("Retirement savings today");

    fireEvent.change(savings, { target: { value: "1500000" } });
    expect(savings).toHaveValue("1,500,000");

    fireEvent.submit(container.querySelector("form")!);

    // Read back as 1.5M, not rejected as NaN and not truncated at the comma.
    expect(pushCoastFireCalculated).toHaveBeenLastCalledWith("reached", 25, "submitted");
    expect(screen.getAllByText("$1,500,000").length).toBeGreaterThanOrEqual(1);
  });

  it("leaves ages and rates as plain numbers, where grouping never applies", () => {
    render(<CoastFireCalculator />);

    expect(screen.getByLabelText("Your age today")).toHaveValue(40);
    expect(screen.getByLabelText("Expected real return")).toHaveValue(5);
  });

  it("reports the default scenario it shows before any submission", () => {
    render(<CoastFireCalculator />);

    expect(pushCoastFireCalculated).toHaveBeenCalledTimes(1);
    expect(pushCoastFireCalculated).toHaveBeenCalledWith("reached", 25, "default");
  });

  /*
   * The whole pitch lives on this page now, so the decisions a Coast FIRE
   * number raises but cannot answer have to be reachable without a second
   * click. An earlier draft put them on a separate /coast-fire landing page.
   */
  it("carries the paid job onto the same page as the free number", () => {
    render(<CoastFireCalculator />);

    expect(screen.getByRole("heading", { name: /have you reached it.*can you really coast/i })).toBeInTheDocument();
    expect(screen.getByText("Could I take a $30K pay cut?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the retirement calculator/ }))
      .toHaveAttribute("href", "/retirement-calculator");
  });

  /*
   * The scorecard's last Coast FIRE funnel stage counts start_free_click with
   * this exact cta_location, so a rename here silently zeroes that stage.
   */
  it("reports the plan CTA under the location the beachhead scorecard counts", () => {
    render(<CoastFireCalculator />);

    const cta = screen.getByRole("link", { name: "Stress-test my Coast FIRE plan" });
    cta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(cta);

    expect(pushStartFreeClick).toHaveBeenCalledWith("coast_fire_plan_cta");
  });

  it("carries the seven numbers into the Coast FIRE signup flow", () => {
    render(<CoastFireCalculator />);

    const cta = screen.getByRole("link", { name: "Stress-test my Coast FIRE plan" });
    expect(cta).toHaveAttribute("href", COAST_FIRE_SIGNUP_HREF);
    cta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(cta);

    expect(readCoastFireSignupContext()?.inputs).toEqual(DEFAULT_COAST_FIRE_INPUTS);
  });

  /*
   * The retirement-shaped handoff this replaced floored assets at $1,000,
   * because its own validation rejected anything lower. The Coast FIRE context
   * accepts the figure as typed, so $0 saved has to survive the trip.
   */
  it("carries $0 saved across rather than substituting a floor", () => {
    const { container } = render(<CoastFireCalculator />);

    fireEvent.change(screen.getByLabelText("Retirement savings today"), { target: { value: "0" } });
    fireEvent.submit(container.querySelector("form")!);

    const cta = screen.getByRole("link", { name: "Stress-test my Coast FIRE plan" });
    cta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(cta);

    expect(readCoastFireSignupContext()?.inputs).toMatchObject({
      currentAge: 40,
      annualRetirementSpending: 80_000,
      currentSavings: 0,
    });
  });

  describe("emailing the result", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
      jest.clearAllMocks();
    });

    function mockSend(response: Partial<Response> = { ok: true }) {
      const fetchMock = jest.fn(async () => ({
        ok: true,
        json: async () => ({ message: "sent" }),
        ...response,
      })) as unknown as typeof fetch;
      global.fetch = fetchMock;
      return fetchMock as unknown as jest.Mock;
    }

    /*
     * The page opens with a default scenario already answered. Collecting an
     * address against it would email someone a stranger's retirement.
     */
    it("asks for an address only after a scenario has been submitted", () => {
      const { container } = render(<CoastFireCalculator />);

      expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();

      fireEvent.submit(container.querySelector("form")!);

      expect(screen.getByLabelText("Email address")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Email me my Coast FIRE results" })).toBeInTheDocument();
    });

    it("posts the seven inputs and never the figures computed from them", async () => {
      const fetchMock = mockSend();
      const { container } = render(<CoastFireCalculator />);

      fireEvent.change(screen.getByLabelText("Retirement savings today"), { target: { value: "250000" } });
      fireEvent.submit(container.querySelector("form")!);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " Reader@Example.com " } });
      fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

      await screen.findByText(/on their way/i);

      const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/coast-fire\/email-results$/);
      const body = JSON.parse(String(request.body));
      expect(body).toEqual({
        email: "Reader@Example.com",
        currentAge: 40,
        retirementAge: 65,
        currentSavings: 250_000,
        annualRetirementSpending: 80_000,
        annualRetirementIncome: 30_000,
        realReturnRate: 5,
        withdrawalRate: 4,
      });
      // The server recalculates, so a computed figure in the body would only be
      // an opportunity to disagree with it.
      expect(body).not.toHaveProperty("coastFireNumber");
    });

    it("reports the conversion with the outcome but never the address", async () => {
      mockSend();
      const { container } = render(<CoastFireCalculator />);

      fireEvent.submit(container.querySelector("form")!);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.com" } });
      fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

      await screen.findByText(/on their way/i);
      expect(pushCoastFireResultsEmailed).toHaveBeenCalledTimes(1);
      expect(pushCoastFireResultsEmailed).toHaveBeenCalledWith("reached");
    });

    it("surfaces a refusal and leaves the form ready to retry", async () => {
      mockSend({ ok: false, json: async () => ({ error: "Enter a valid email address." }) });
      const { container } = render(<CoastFireCalculator />);

      fireEvent.submit(container.querySelector("form")!);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.com" } });
      fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

      expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
      expect(screen.getByRole("button", { name: "Email me my Coast FIRE results" })).toBeEnabled();
      expect(pushCoastFireResultsEmailed).not.toHaveBeenCalled();
    });

    /*
     * The form and the result are one row of matched cards; the capture is a
     * band across both. Inside the result column it made that column taller
     * than the form and the row read as lopsided.
     */
    it("sits across both cards rather than inside the result column", () => {
      const { container } = render(<CoastFireCalculator />);
      fireEvent.submit(container.querySelector("form")!);

      const capture = screen.getByLabelText("Email address").closest("form")!;
      expect(container.querySelector(".cf-result-column")).not.toContainElement(capture);
      expect(capture.closest(".cf-email-band")).toBeInTheDocument();
    });

    it("keeps the typed address out of Contentsquare recordings", () => {
      const { container } = render(<CoastFireCalculator />);
      fireEvent.submit(container.querySelector("form")!);

      expect(screen.getByLabelText("Email address")).toHaveAttribute("data-cs-mask");
    });
  });

  it("keeps each measured call to action uniquely identifiable", () => {
    const { container } = render(<CoastFireCalculator />);
    const ids = Array.from(container.querySelectorAll("[data-cs-override-id]"))
      .map((element) => element.getAttribute("data-cs-override-id"));

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders the same FAQ copy used by structured data", () => {
    render(<CoastFireCalculatorSeoContent />);

    for (const item of COAST_FIRE_FAQ) {
      expect(screen.getByRole("heading", { name: item.question })).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    }
  });

  it("publishes one canonical, snippet-length metadata set", () => {
    expect(calculatorMetadata.alternates?.canonical).toBe("https://asklinc.com/coast-fire-calculator");
    expect(String(calculatorMetadata.title)).toMatch(/Coast FIRE Calculator/i);
    expect(String(calculatorMetadata.description).length).toBeLessThanOrEqual(160);
  });
});
