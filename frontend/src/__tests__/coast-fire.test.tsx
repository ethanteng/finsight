import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  pushCalculatorRunLimitReached,
  pushCoastFireResultsEmailed,
  pushStartFreeClick,
} from "@/lib/dataLayer";
import {
  readCoastFireSignupContext,
  COAST_FIRE_SIGNUP_HREF,
} from "@/lib/coast-fire-signup-context";
import { leaveForSignup } from "@/lib/calculator-handover";
import { CALCULATOR_RUN_LIMIT } from "@/lib/calculator-run-limit";

jest.mock("@/lib/dataLayer", () => ({
  pushCoastFireCalculated: jest.fn(),
  pushCalculatorRunLimitReached: jest.fn(),
  pushCoastFireResultsEmailed: jest.fn(),
  pushStartFreeClick: jest.fn(),
}));

/*
 * jsdom implements neither navigation nor a `location` that can be replaced,
 * so the one function that leaves the page is mocked. Everything else in the
 * module is real, including the cookie the capture writes.
 */
jest.mock("@/lib/calculator-handover", () => ({
  ...jest.requireActual("@/lib/calculator-handover"),
  leaveForSignup: jest.fn(),
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

  /**
   * The five figures that belong to the visitor, which the page no longer
   * fills in for them. The return and the withdrawal rate are left alone:
   * those open on a stated convention, the way the retirement calculator's
   * allocation preset does.
   */
  function fillForm(overrides: Record<string, string> = {}) {
    const values: Record<string, string> = {
      "Your age today": "40",
      "Retirement age": "65",
      "Retirement savings today": "400000",
      "Annual spending in retirement": "80000",
      "Annual income available at retirement": "30000",
      ...overrides,
    };
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
  }

  /*
   * The page used to open with all seven boxes filled and a finished answer
   * beside them, which reads as a result the visitor already has rather than
   * an illustration of one.
   */
  it("opens with empty inputs and no result", () => {
    render(<CoastFireCalculator />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Have I reached Coast FIRE?");
    expect(screen.getByLabelText("Your age today")).toHaveValue(null);
    expect(screen.getByLabelText("Retirement savings today")).toHaveValue("");
    expect(screen.getByLabelText("Retirement savings today")).toHaveAttribute("placeholder", "e.g. 400,000");

    // No figure, no verdict, nothing that could be mistaken for an answer.
    expect(screen.queryByText("$369,128")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /reached Coast FIRE\./ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /still building your coast/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Your number, once you fill in the form/ })).toBeInTheDocument();
  });

  /*
   * The form gave up its standalone note so that the capture band under the
   * result clears the fold on a laptop. What the note said had to survive that:
   * one half of it rides on the kicker, and the other was already stated, in
   * more detail, next to the box it governs.
   */
  it("keeps the guidance the form note carried", () => {
    render(<CoastFireCalculator />);

    expect(screen.getByText(/SEVEN NUMBERS \u00b7 TODAY\u2019S DOLLARS/)).toBeInTheDocument();
    expect(screen.getByText(/income that starts on your retirement date/)).toBeInTheDocument();
    // And the reassurance the removed privacy note ended on is still on the page.
    expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
  });

  /*
   * The two assumptions are not the visitor's figures and nobody knows theirs,
   * so asking them to invent one before the page will answer at all is a worse
   * ask than stating the convention.
   */
  it("keeps the return and withdrawal assumptions on their stated convention", () => {
    render(<CoastFireCalculator />);

    expect(screen.getByLabelText("Expected real return")).toHaveValue(5);
    expect(screen.getByLabelText("Withdrawal rate")).toHaveValue(4);
  });

  it("answers once the visitor has entered their own numbers", () => {
    const { container } = render(<CoastFireCalculator />);

    fillForm();
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getAllByText("$369,128").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "You’ve reached Coast FIRE." })).toBeInTheDocument();
  });

  /*
   * Named together rather than one at a time: the browser's own bubble points
   * at whichever box it reached first and vanishes on the next click.
   */
  it("says which boxes are empty rather than answering around them", () => {
    const { container } = render(<CoastFireCalculator />);

    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter your age today, your retirement age, your retirement savings today and your annual spending in retirement to get your Coast FIRE number."
    );
    expect(screen.queryByRole("heading", { name: /reached Coast FIRE\./ })).not.toBeInTheDocument();
  });

  /*
   * A refused re-submit is the empty-open thesis applied to the second run.
   * Keeping the previous answer while the form has moved away from it says two
   * things at once — the banner asks for a figure "to get your Coast FIRE
   * number" while a Coast FIRE number sits beside it — and it leaves the
   * capture and the signup handoff attached to a run the form no longer
   * matches, which is the stale handoff this page already had to fix once.
   */
  it("takes the previous answer down when a re-run is refused", () => {
    const { container } = render(<CoastFireCalculator />);

    fillForm();
    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getAllByText("$369,128").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();

    // Clear a figure the formula needs and ask again.
    fireEvent.change(screen.getByLabelText("Retirement savings today"), { target: { value: "" } });
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent("Enter your retirement savings today");
    expect(screen.queryByText("$369,128")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Your number, once you fill in the form/ })).toBeInTheDocument();
  });

  /* Same for a figure the formula refuses by name rather than a blank one. */
  it("takes it down for an out-of-range figure too", () => {
    const { container } = render(<CoastFireCalculator />);

    fillForm();
    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getAllByText("$369,128").length).toBeGreaterThanOrEqual(1);

    fillForm({ "Annual spending in retirement": "50000000" });
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent("Annual spending must be $10,000,000 or less.");
    expect(screen.queryByText("$369,128")).not.toBeInTheDocument();
  });

  /* The kicker generalises with the list under it. */
  it("does not call the assumptions a result's before there is one", () => {
    const { container } = render(<CoastFireCalculator />);

    expect(screen.getByText("WHAT THE FORMULA ASSUMES")).toBeInTheDocument();
    expect(screen.queryByText("WHAT THIS RESULT ASSUMES")).not.toBeInTheDocument();

    fillForm();
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByText("WHAT THIS RESULT ASSUMES")).toBeInTheDocument();
  });

  /* Not everyone expects a pension or Social Security by the date they pick. */
  it("treats a blank retirement income as none rather than refusing it", () => {
    const { container } = render(<CoastFireCalculator />);

    fillForm({ "Annual income available at retirement": "" });
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // $80,000 at a 4% withdrawal rate, with nothing offsetting it.
    expect(screen.getAllByText("$2,000,000").length).toBeGreaterThanOrEqual(1);
  });

  it("recalculates a not-yet result and tracks only the outcome", () => {
    const { container } = render(<CoastFireCalculator />);

    fillForm({ "Retirement savings today": "100000" });
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByRole("heading", { name: "You’re still building your coast." })).toBeInTheDocument();
    expect(screen.getByText(/short of your Coast FIRE number today/i)).toBeInTheDocument();
    expect(pushCoastFireCalculated).toHaveBeenCalledWith("not_yet", 25);
    expect(JSON.stringify(jest.mocked(pushCoastFireCalculated).mock.calls)).not.toContain("100000");
  });

  /*
   * `type="number"` cannot show grouping, so the money boxes are text. The
   * figure a visitor is most likely to mistype is the one with the most
   * zeros in it.
   */
  it("groups money as it is typed, and reads the grouped figure back", () => {
    const { container } = render(<CoastFireCalculator />);
    fillForm({ "Retirement savings today": "1500000" });
    const savings = screen.getByLabelText("Retirement savings today");
    expect(savings).toHaveValue("1,500,000");

    fireEvent.submit(container.querySelector("form")!);

    // Read back as 1.5M, not rejected as NaN and not truncated at the comma.
    expect(pushCoastFireCalculated).toHaveBeenLastCalledWith("reached", 25);
    expect(screen.getAllByText("$1,500,000").length).toBeGreaterThanOrEqual(1);
  });

  /*
   * The boxes are text now, so the browser no longer range-checks them. These
   * two cases are what replaced that: a figure the page would have blocked has
   * to be refused by name rather than answered confidently.
   */
  it("refuses a money figure larger than the calculator models", () => {
    const { container } = render(<CoastFireCalculator />);

    fillForm({ "Annual spending in retirement": "50000000" });
    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent("Annual spending must be $10,000,000 or less.");
  });

  /*
   * A pasted or typed minus used to be stripped on the way in, so -5,000
   * displayed as 5,000 and was answered as a positive. Silently inverting
   * someone's figure is worse than any rejection.
   */
  it("keeps a negative as typed, and refuses it by name", () => {
    const { container } = render(<CoastFireCalculator />);
    fillForm({ "Retirement savings today": "-5000" });
    expect(screen.getByLabelText("Retirement savings today")).toHaveValue("-5,000");

    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("cannot be negative");
  });

  it("leaves ages and rates as plain numbers, where grouping never applies", () => {
    render(<CoastFireCalculator />);

    fillForm({ "Your age today": "40" });
    expect(screen.getByLabelText("Your age today")).toHaveValue(40);
    expect(screen.getByLabelText("Expected real return")).toHaveValue(5);
  });

  it("does not count a page view as an intentional calculation", () => {
    render(<CoastFireCalculator />);

    expect(pushCoastFireCalculated).not.toHaveBeenCalled();
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
    const { container } = render(<CoastFireCalculator />);

    fillForm();
    fireEvent.submit(container.querySelector("form")!);

    const cta = screen.getByRole("link", { name: "Stress-test my Coast FIRE plan" });
    expect(cta).toHaveAttribute("href", COAST_FIRE_SIGNUP_HREF);
    cta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(cta);

    expect(readCoastFireSignupContext()?.inputs).toEqual(DEFAULT_COAST_FIRE_INPUTS);
  });

  /*
   * A stored scenario lives for two hours. Someone who ran one, came back to
   * the page, and clicked through without running another would otherwise hand
   * signup a run the page they just left was not showing — which is the same
   * "answer you did not ask for" this page was emptied to avoid, one click
   * further on.
   */
  it("does not hand signup a scenario this page is not showing", () => {
    const { container, unmount } = render(<CoastFireCalculator />);

    fillForm();
    fireEvent.submit(container.querySelector("form")!);
    const cta = screen.getByRole("link", { name: "Stress-test my Coast FIRE plan" });
    cta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(cta);
    expect(readCoastFireSignupContext()).not.toBeNull();

    // Back to the page, nothing entered, straight to the CTA.
    unmount();
    render(<CoastFireCalculator />);
    const secondCta = screen.getByRole("link", { name: "Stress-test my Coast FIRE plan" });
    secondCta.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(secondCta);

    expect(readCoastFireSignupContext()).toBeNull();
  });

  /*
   * The retirement-shaped handoff this replaced floored assets at $1,000,
   * because its own validation rejected anything lower. The Coast FIRE context
   * accepts the figure as typed, so $0 saved has to survive the trip.
   */
  it("carries $0 saved across rather than substituting a floor", () => {
    const { container } = render(<CoastFireCalculator />);

    fillForm({ "Retirement savings today": "0" });
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
     * Submitting a scenario also asks the server for a plain-language reading
     * of it, so the send is no longer the page's only request. Cases about the
     * send pick it out by URL rather than by position.
     */
    function sendCall(fetchMock: jest.Mock): [string, RequestInit] {
      const call = (fetchMock.mock.calls as Array<[string, RequestInit]>)
        .find(([url]) => String(url).includes("/email-results"));
      if (!call) throw new Error("the results email was never requested");
      return call;
    }

    /*
     * The page opens with no result. Collecting an address before anyone has
     * asked for an answer would attach their address to figures they never ran.
     */
    it("asks for an address only after a scenario has been submitted", () => {
      const { container } = render(<CoastFireCalculator />);

      expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();

      // A refused submit is not a scenario either: there is no result to email.
      fireEvent.submit(container.querySelector("form")!);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();

      fillForm();
      fireEvent.submit(container.querySelector("form")!);

      expect(screen.getByLabelText("Email address")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save these results to your free account" })).toBeInTheDocument();
    });

    /*
     * The ask is an account, not an inbox copy, so submitting takes the
     * visitor to signup rather than leaving them to go and find the message.
     * The email is still sent — it is what someone who wanders off returns to.
     */
    it("carries the run to signup instead of stopping at the inbox", async () => {
      const ref = "c".repeat(48);
      mockSend({ ok: true, json: async () => ({ message: "sent", ref }) } as Partial<Response>);
      const { container } = render(<CoastFireCalculator />);

      fillForm();
      fireEvent.submit(container.querySelector("form")!);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.com" } });
      fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

      await waitFor(() => expect(jest.mocked(leaveForSignup)).toHaveBeenCalled());
      const destination = jest.mocked(leaveForSignup).mock.calls[0][0];
      expect(destination).toContain("/getstarted?source=coast-fire-calculator");
      expect(destination).toContain("entry=results_page");
      // Never in the address of a page that renders: GTM records those.
      expect(destination).not.toContain(ref);

      // The cookie is scoped to the path that spends it, so it is read from
      // there — which is also the only place it would ever be sent.
      window.history.replaceState({}, "", "/getstarted");
      expect(document.cookie).toContain(ref);
      expect(readCoastFireSignupContext()?.sourceToken).toBe(ref);
    });

    /* No token came back, so there is nothing to carry and the inbox is it. */
    it("stays on the page when no token comes back", async () => {
      mockSend();
      const { container } = render(<CoastFireCalculator />);

      fillForm();
      fireEvent.submit(container.querySelector("form")!);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.com" } });
      fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

      await screen.findByText(/on its way/i);
      expect(jest.mocked(leaveForSignup)).not.toHaveBeenCalled();
    });

    /*
     * Three runs answer the question the page asks. Past that it is being used
     * as a free modelling tool, and the only thing left is to save the result.
     */
    it("locks the calculator after three runs and points at the save form", () => {
      const { container } = render(<CoastFireCalculator />);

      fillForm();
      for (let run = 0; run < CALCULATOR_RUN_LIMIT; run += 1) {
        fireEvent.submit(container.querySelector("form")!);
      }

      expect(screen.getByRole("button", { name: /calculate my coast fire number/i })).toBeDisabled();
      expect(screen.getByText(new RegExp(`that is ${CALCULATOR_RUN_LIMIT} runs`, "i")))
        .toBeInTheDocument();
      expect(pushCalculatorRunLimitReached).toHaveBeenCalledTimes(1);
      expect(pushCalculatorRunLimitReached).toHaveBeenCalledWith('coast_fire');
      // The save form is still there: it is what the lock is pointing at.
      expect(screen.getByRole("button", { name: "Save these results to your free account" })).toBeEnabled();
    });

    it("posts the seven inputs and never the figures computed from them", async () => {
      const fetchMock = mockSend();
      const { container } = render(<CoastFireCalculator />);

      fillForm({ "Retirement savings today": "250000" });
      fireEvent.submit(container.querySelector("form")!);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " Reader@Example.com " } });
      fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

      await screen.findByText(/on its way/i);

      const [url, request] = sendCall(fetchMock);
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
        attribution: { landingPage: "/coast-fire-calculator" },
      });
      // The server recalculates, so a computed figure in the body would only be
      // an opportunity to disagree with it.
      expect(body).not.toHaveProperty("coastFireNumber");
    });

    it("reports the conversion with the outcome but never the address", async () => {
      mockSend();
      const { container } = render(<CoastFireCalculator />);

      fillForm();
      fireEvent.submit(container.querySelector("form")!);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.com" } });
      fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

      await screen.findByText(/on its way/i);
      expect(pushCoastFireResultsEmailed).toHaveBeenCalledTimes(1);
      expect(pushCoastFireResultsEmailed).toHaveBeenCalledWith("reached");
    });

    it("surfaces a refusal and leaves the form ready to retry", async () => {
      mockSend({ ok: false, json: async () => ({ error: "Enter a valid email address." }) });
      const { container } = render(<CoastFireCalculator />);

      fillForm();
      fireEvent.submit(container.querySelector("form")!);
      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.com" } });
      fireEvent.submit(screen.getByLabelText("Email address").closest("form")!);

      expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
      expect(screen.getByRole("button", { name: "Save these results to your free account" })).toBeEnabled();
      expect(pushCoastFireResultsEmailed).not.toHaveBeenCalled();
    });

    /*
     * The form and the result are one row of matched cards; the capture is a
     * band across both. Inside the result column it made that column taller
     * than the form and the row read as lopsided.
     */
    it("sits across both cards rather than inside the result column", () => {
      const { container } = render(<CoastFireCalculator />);
      fillForm();
      fireEvent.submit(container.querySelector("form")!);

      const capture = screen.getByLabelText("Email address").closest("form")!;
      expect(container.querySelector(".cf-result-column")).not.toContainElement(capture);
      expect(capture.closest(".cf-email-band")).toBeInTheDocument();
    });

    it("keeps the typed address out of Contentsquare recordings", () => {
      const { container } = render(<CoastFireCalculator />);
      fillForm();
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
