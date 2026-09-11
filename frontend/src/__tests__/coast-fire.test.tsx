import { fireEvent, render, screen } from "@testing-library/react";
import { CoastFireCalculator } from "@/components/marketing/CoastFireCalculator";
import { CoastFireCalculatorSeoContent } from "@/components/marketing/CoastFireCalculatorSeoContent";
import { CoastFireLanding } from "@/components/marketing/CoastFireLanding";
import { metadata as calculatorMetadata } from "@/app/coast-fire-calculator/page";
import { metadata as landingMetadata } from "@/app/coast-fire/page";
import {
  calculateCoastFire,
  COAST_FIRE_FAQ,
  DEFAULT_COAST_FIRE_INPUTS,
} from "@/lib/coast-fire";
import { pushCoastFireCalculated } from "@/lib/dataLayer";
import {
  readRetirementSignupContext,
  RETIREMENT_SIGNUP_HREF,
} from "@/lib/retirement-signup-context";

jest.mock("@/lib/dataLayer", () => ({
  pushCoastFireCalculated: jest.fn(),
  pushCoastFireCalculatorClick: jest.fn(),
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
    expect(pushCoastFireCalculated).toHaveBeenCalledWith("not_yet", 25);
    expect(JSON.stringify(jest.mocked(pushCoastFireCalculated).mock.calls)).not.toContain("100000");
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

  it("renders the same FAQ copy used by structured data", () => {
    render(<CoastFireCalculatorSeoContent />);

    for (const item of COAST_FIRE_FAQ) {
      expect(screen.getByRole("heading", { name: item.question })).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    }
  });
});

describe("Coast FIRE landing page", () => {
  it("leads with optionality and links into the calculator", () => {
    render(<CoastFireLanding />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Know what your money lets you do next.");
    expect(screen.getByRole("heading", { name: /The point isn’t to stop working/i })).toBeInTheDocument();
    const calculatorLinks = screen.getAllByRole("link", { name: /Check my Coast FIRE number|Calculate my number/ });
    expect(calculatorLinks.length).toBeGreaterThanOrEqual(3);
    calculatorLinks.forEach((link) => expect(link).toHaveAttribute("href", "/coast-fire-calculator"));
    expect(screen.getByText("Could I take a $30K pay cut?")).toBeInTheDocument();
  });

  it("keeps each measured call to action uniquely identifiable", () => {
    const { container } = render(<CoastFireLanding />);
    const ids = Array.from(container.querySelectorAll("[data-cs-override-id]"))
      .map((element) => element.getAttribute("data-cs-override-id"));

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("publishes focused, canonical metadata for both routes", () => {
    expect(landingMetadata.alternates?.canonical).toBe("https://asklinc.com/coast-fire");
    expect(calculatorMetadata.alternates?.canonical).toBe("https://asklinc.com/coast-fire-calculator");
    expect(String(calculatorMetadata.title)).toMatch(/Coast FIRE Calculator/i);
    expect(String(calculatorMetadata.description).length).toBeLessThanOrEqual(160);
  });
});
