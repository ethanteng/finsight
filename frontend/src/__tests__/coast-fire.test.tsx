import { fireEvent, render, screen } from "@testing-library/react";
import { CoastFireCalculator } from "@/components/marketing/CoastFireCalculator";
import { CoastFireCalculatorSeoContent } from "@/components/marketing/CoastFireCalculatorSeoContent";
import { metadata as calculatorMetadata } from "@/app/coast-fire-calculator/page";
import {
  calculateCoastFire,
  COAST_FIRE_FAQ,
  DEFAULT_COAST_FIRE_INPUTS,
} from "@/lib/coast-fire";
import { pushCoastFireCalculated, pushStartFreeClick } from "@/lib/dataLayer";
import {
  readRetirementSignupContext,
  RETIREMENT_SIGNUP_HREF,
} from "@/lib/retirement-signup-context";

jest.mock("@/lib/dataLayer", () => ({
  pushCoastFireCalculated: jest.fn(),
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
    expect(screen.getByLabelText("Retirement savings today")).toHaveValue(400000);
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

  it("carries the simple scenario into the retirement signup flow", () => {
    render(<CoastFireCalculator />);

    const cta = screen.getByRole("link", { name: "Stress-test my Coast FIRE plan" });
    expect(cta).toHaveAttribute("href", RETIREMENT_SIGNUP_HREF);
    cta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(cta);

    const context = readRetirementSignupContext();
    expect(context?.inputs).toMatchObject({
      currentAge: 40,
      retirementAge: 65,
      investableAssets: 400_000,
      annualSpending: 80_000,
      annualContributions: 0,
    });
  });

  /*
   * The stored context rejects assets under $1,000, so an unfloored $0 would
   * drop the visitor's ages and spending along with it.
   */
  it("still carries the scenario when no savings were entered", () => {
    const { container } = render(<CoastFireCalculator />);

    fireEvent.change(screen.getByLabelText("Retirement savings today"), { target: { value: "0" } });
    fireEvent.submit(container.querySelector("form")!);

    const cta = screen.getByRole("link", { name: "Stress-test my Coast FIRE plan" });
    cta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(cta);

    expect(readRetirementSignupContext()?.inputs).toMatchObject({
      currentAge: 40,
      annualSpending: 80_000,
      investableAssets: 1_000,
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
