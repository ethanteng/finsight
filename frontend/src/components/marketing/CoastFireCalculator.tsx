"use client";

/**
 * The Coast FIRE decision page: seven numbers in, the simple formula's answer
 * back, then the reason the simple formula is not the decision.
 *
 * Deliberately one page, mirroring /retirement-calculator. An earlier draft
 * split the pitch onto /coast-fire and the tool onto /coast-fire-calculator,
 * which put a click between the search term and the answer it promised and
 * split the ranking for the same query.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  calculateCoastFire,
  DEFAULT_COAST_FIRE_INPUTS,
  type CoastFireInputs,
  type CoastFireResult,
} from "@/lib/coast-fire";
import { pushCoastFireCalculated } from "@/lib/dataLayer";
import { useCalculatorLimitTracking } from "@/lib/use-calculator-limit-tracking";
import {
  COAST_FIRE_RUN_COUNT_KEY,
  runLimitPhrase,
  isRunLimitReached,
  readRunCount,
  recordRun,
} from "@/lib/calculator-run-limit";
import { fromGrouped, withCommas } from "@/lib/number-input";
import {
  clearCoastFireSignupContext,
  COAST_FIRE_SIGNUP_HREF,
} from "@/lib/coast-fire-signup-context";
import { CoastFireEmailCapture } from "./CoastFireEmailCapture";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { CalculatorSteps, CalculatorPreview, CalculatorNextQuestion, CalculatorRunAgain, CalculatorLockedResult } from "./CalculatorStory";
import { TRIAL_CTA_MICROCOPY } from "./trial-copy";

type FormState = Record<keyof CoastFireInputs, string>;

/**
 * The boxes that hold money, and so hold grouped digits.
 *
 * They are text inputs rather than `type="number"`, which cannot show
 * grouping: `1500000` stays an unreadable run of zeros exactly where someone
 * most needs to check they typed the figure they meant. Ages and rates stay
 * numeric, where a spinner is useful and grouping never applies.
 */
const MONEY_FIELDS = new Set<keyof CoastFireInputs>([
  "currentSavings",
  "annualRetirementSpending",
  "annualRetirementIncome",
]);

/**
 * What each box shows when it is empty.
 *
 * Examples, not values. The page used to open with all seven boxes filled in
 * and a finished answer beside them, which reads as a result the visitor
 * already has — the one thing a calculator must never imply. These are the
 * same figures, greyed and inert, so the shape of the expected answer is still
 * visible without anything claiming to be theirs.
 */
const PLACEHOLDERS: Partial<Record<keyof CoastFireInputs, string>> = {
  currentAge: "e.g. 40",
  retirementAge: "e.g. 65",
  currentSavings: "e.g. 400,000",
  annualRetirementSpending: "e.g. 80,000",
  annualRetirementIncome: "e.g. 30,000",
};

/**
 * The two boxes that open with a figure in them, and why they are not the
 * same kind of thing as the other five.
 *
 * A real return and a withdrawal rate are assumptions rather than facts about
 * the visitor: nobody knows theirs, and asking someone to invent one before
 * the page will answer at all is a worse ask than stating the convention and
 * letting them argue with it. `/retirement-calculator` draws the line in the
 * same place — its allocation preset and its Social Security age open on a
 * stated default, while every figure that belongs to the visitor opens empty.
 */
const ASSUMED_FIELDS = new Set<keyof CoastFireInputs>(['realReturnRate', 'withdrawalRate']);

const INITIAL_FORM: FormState = Object.fromEntries(
  Object.entries(DEFAULT_COAST_FIRE_INPUTS).map(([key, value]) => [
    key,
    ASSUMED_FIELDS.has(key as keyof CoastFireInputs) ? String(value) : "",
  ]),
) as FormState;

/** Required because the formula cannot proceed without them, in reading order. */
const REQUIRED_FIELDS: Array<[keyof CoastFireInputs, string]> = [
  ["currentAge", "your age today"],
  ["retirementAge", "your retirement age"],
  ["currentSavings", "your retirement savings today"],
  ["annualRetirementSpending", "your annual spending in retirement"],
];

/** The decisions a Coast FIRE number raises but cannot answer. */
const DECISIONS = [
  "Can I stop maxing my 401(k)?",
  "Could I take a $30K pay cut?",
  "Could one of us stop working?",
  "What if returns are worse than this?",
  "Can I spend $20K more a year?",
];

function dollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

/**
 * Read the form back as numbers.
 *
 * The money boxes hold grouped text ("1,500,000"), so they go through
 * `fromGrouped`; `Number` on that string is NaN, which the calculator would
 * refuse by name but only after the visitor had watched a correct-looking
 * figure be rejected.
 */
function parseForm(form: FormState): CoastFireInputs {
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => {
      const field = key as keyof CoastFireInputs;
      // Retirement income is the one figure where blank has a meaning: not
      // everyone has a pension or expects Social Security by then. Every other
      // blank is NaN, which the formula refuses by name — `Number("")` is 0,
      // and a zero nobody typed would answer confidently about a plan that
      // does not exist.
      if (value.trim() === "") return [key, field === "annualRetirementIncome" ? 0 : Number.NaN];
      return [key, MONEY_FIELDS.has(field) ? fromGrouped(value) : Number(value)];
    }),
  ) as unknown as CoastFireInputs;
}

/**
 * What the card says before there is anything to say.
 *
 * The card holds its place rather than disappearing: the form and the result
 * are a matched pair sized as one row, and dropping one of them mid-layout
 * moves the other. What it must not do is look like an answer — no figure, no
 * status pill, nothing a reader could mistake for theirs.
 */
function EmptyResultPanel() {
  /*
   * Deliberately not `aria-live`. This panel is static until a run replaces it;
   * a live region on mount would announce a waiting card on every page view.
   * The answered card carries `aria-live` so the verdict is announced when it
   * appears.
   */
  return <CalculatorPreview coast />;
}

function CalculatorField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  min,
  max,
  step = "1",
}: {
  id: keyof CoastFireInputs;
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  min: number;
  max: number;
  step?: string;
}) {
  const placeholder = PLACEHOLDERS[id];
  /*
   * A money box is text, so it can show grouped digits as they are typed.
   * That costs the browser's own range checking, which the calculator already
   * duplicates and states better — it names the figure it refused. Ages and
   * rates stay numeric, where the spinner earns its place.
   */
  const isMoney = MONEY_FIELDS.has(id);

  return (
    <div className="cf-field">
      <label htmlFor={id}>{label}</label>
      <div className="cf-input-wrap">
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          type={isMoney ? "text" : "number"}
          inputMode="decimal"
          autoComplete="off"
          {...(isMoney ? {} : { min, max, step })}
          {...(placeholder ? { placeholder } : {})}
          /*
           * Deliberately not `required`. The browser's own bubble names one
           * box at a time and disappears on the next click; the form says what
           * is missing, in the page's own words, next to the button that
           * refused. See `handleSubmit`.
           */
          value={value}
          onChange={(event) =>
            onChange(isMoney ? withCommas(event.target.value) : event.target.value)
          }
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
      {hint && <p>{hint}</p>}
    </div>
  );
}

export function CoastFireCalculator({ children }: { children?: ReactNode }) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showInputs, setShowInputs] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  /*
   * Null until the visitor asks for an answer.
   *
   * The page used to open on a worked example already answered, which reads as
   * a result they have rather than an illustration of one — and everything
   * downstream inherited that. The answer itself is never shown here now; it
   * opens in Ask Linc. This gates the locked card and the email form.
   */
  const [result, setResult] = useState<CoastFireResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Runs this visitor has spent in this tab. Hydrated from storage on mount. */
  const [runCount, setRunCount] = useState(0);
  const locked = isRunLimitReached(runCount);
  useCalculatorLimitTracking('coast_fire', locked);
  const resultRef = useRef<HTMLDivElement>(null);
  /*
   * Counts accepted runs, so the capture remounts for every one, even for an
   * identical re-run: a prior run's form state never belongs to this one.
   */
  const [runId, setRunId] = useState(0);

  const setField = (field: keyof CoastFireInputs) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  /**
   * A refusal leaves nothing on screen claiming to be an answer.
   *
   * The alternative — keeping the last good result while the form no longer
   * matches it — reads as generosity but says two things at once: the banner
   * asks for a figure "to get your Coast FIRE number" while a Coast FIRE
   * number sits beside it. It also leaves the capture and the signup handoff
   * attached to a run the form has moved away from, which is the same stale
   * handoff this page already had to fix once.
   *
   * What it costs is one click on a typo, with every other box still filled.
   */
  function refuse(message: string) {
    setError(message);
    setShowInputs(true);
    setResult(null);
  }

  /*
   * Read after mount rather than during render: the page is server-rendered,
   * and session storage does not exist there. The button is therefore live for
   * one frame on a reload that should find it locked, which is the right cost
   * for a nudge — see `calculator-run-limit`.
   */
  useEffect(() => {
    setRunCount(readRunCount(COAST_FIRE_RUN_COUNT_KEY));
  }, []);

  function editInputs() {
    if (locked) return;
    setShowInputs(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      formRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;

    // Named before the formula runs, so a visitor who left two boxes empty is
    // told about both rather than about whichever one the formula reached
    // first and refused for looking like a zero.
    const missing = REQUIRED_FIELDS.filter(([field]) => form[field].trim() === "");
    if (missing.length > 0) {
      const names = missing.map(([, name]) => name);
      const list = names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
      refuse(`Enter ${list} to get your Coast FIRE number.`);
      return;
    }

    try {
      const nextResult = calculateCoastFire(parseForm(form));
      setResult(nextResult);
      setRunId((current) => current + 1);
      setShowInputs(false);
      setError(null);
      // Only a run that produced a number counts. A refused form does not come
      // out of this visitor's allowance.
      setRunCount(recordRun(COAST_FIRE_RUN_COUNT_KEY, runCount));
      pushCoastFireCalculated(
        nextResult.hasReachedCoastFire ? "reached" : "not_yet",
        nextResult.yearsToRetirement,
      );
      requestAnimationFrame(() => {
        resultRef.current?.focus({ preventScroll: true });
        resultRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    } catch (caught) {
      refuse(caught instanceof Error ? caught.message : "Check your numbers and try again.");
    }
  }

  return (
    <main className={`marketing-site subpage coast-fire-page calculator-story${!showInputs ? " calculator-result-view" : ""}`}>
      <SiteHeader />

      <section className="shell cf-hero">
        <p className="section-kicker">FREE COAST FIRE CALCULATOR</p>
        <h1>{showInputs ? <>Have I reached <em>Coast FIRE?</em></> : "Your Coast FIRE result."}</h1>
        <p className="cf-hero-sub">
          Add a few numbers. See whether your savings could grow to your retirement target without more contributions—and which assumptions make the difference.
        </p>
        <p className="calculator-access">Free. Your result opens in Ask Linc with just your email and a password.</p>
        <CalculatorSteps />
      </section>

      <section className="shell cf-calculator" id="coast-calculator" hidden={!showInputs}>
        <form className="cf-form" ref={formRef} onSubmit={handleSubmit}>
          {/*
            * The standalone note this used to carry said two things. One
            * ("count only income that starts the day you retire") the income
            * field's own hint already says, in more detail and next to the box
            * it governs. The other rides on the kicker, which costs no height
            * — and height is the whole point: what the form gives up, the
            * capture band below the result gets back, above the fold.
            */}
          <div className="cf-form-head">
            <p className="section-kicker">01 / YOUR STARTING POINT</p>
            <h2>Start with your numbers.</h2>
            <p className="cf-form-note">Seven inputs. All amounts in today’s dollars.</p>
          </div>

          <div className="cf-form-grid">
            <CalculatorField id="currentAge" label="Your age today" value={form.currentAge} onChange={setField("currentAge")} suffix="years" min={18} max={90} />
            <CalculatorField id="retirementAge" label="Retirement age" value={form.retirementAge} onChange={setField("retirementAge")} suffix="years" min={30} max={95} />
            <CalculatorField id="currentSavings" label="Retirement savings today" value={form.currentSavings} onChange={setField("currentSavings")} prefix="$" min={0} max={100_000_000} />
            <CalculatorField id="annualRetirementSpending" label="Annual spending in retirement" value={form.annualRetirementSpending} onChange={setField("annualRetirementSpending")} prefix="$" min={1_000} max={10_000_000} hint="Whole household, after tax." />
            <CalculatorField id="annualRetirementIncome" label="Annual income available at retirement" value={form.annualRetirementIncome} onChange={setField("annualRetirementIncome")} prefix="$" min={0} max={10_000_000} hint="Social Security, a pension, or other reliable income that starts on your retirement date." />
            <CalculatorField id="realReturnRate" label="Expected real return" value={form.realReturnRate} onChange={setField("realReturnRate")} suffix="%" min={0} max={12} step="0.1" hint="Growth after inflation." />
            <CalculatorField id="withdrawalRate" label="Withdrawal rate" value={form.withdrawalRate} onChange={setField("withdrawalRate")} suffix="%" min={2} max={8} step="0.1" hint="The share you spend in year one." />
          </div>

          {error && <p className="cf-form-error" role="alert">{error}</p>}
          <button
            className="button button-primary cf-calculate-button"
            type="submit"
            disabled={locked}
            data-cs-override-id="coast-fire-calculate"
          >
            Calculate my Coast FIRE number <span aria-hidden="true">→</span>
          </button>
          {locked && (
            <p className="cf-form-locked" role="status">
              That is {runLimitPhrase()}. Save this result to a free account to keep exploring and add your connected accounts.
            </p>
          )}
        </form>

        <div className="cf-result-column">{showInputs && <EmptyResultPanel />}</div>
      </section>

      <div ref={resultRef} className="calculator-result-focus" tabIndex={-1} hidden={showInputs} aria-label="Your Coast FIRE result">
        {result && <div className="calculator-result-grid shell">
          <div className="calculator-result-summary">
            <CalculatorLockedResult coast />
          </div>
          <div className="calculator-result-actions">
            <CoastFireEmailCapture compact
              // Remount for every run, so a prior run's state cannot claim to
              // belong to the one now on screen.
              key={runId}
              result={result}
            />
            <CalculatorRunAgain locked={locked} onEdit={editInputs} />
          </div>
        </div>}
      </div>

      {!result && <CalculatorNextQuestion coast />}

      <section className="shell cf-assumptions">
        <div className="cf-section-head">
          {/* Generic until there is a result, like the list beneath it. */}
          <p className="section-kicker">
            {result ? "WHAT THIS RESULT ASSUMES" : "WHAT THE FORMULA ASSUMES"}
          </p>
          <h2>Simple enough to check.</h2>
        </div>
        <ul>
          <li><strong>Constant real growth</strong><span>Your portfolio earns the same after-inflation return every year until retirement.</span></li>
          <li><strong>No more contributions</strong><span>The projection adds $0 from today through {result ? `age ${result.retirementAge}` : "the retirement age you enter"}.</span></li>
          <li><strong>One withdrawal rate</strong><span>Your retirement target is annual portfolio spending divided by {result ? `${result.withdrawalRate}%` : "your withdrawal rate"}.</span></li>
          <li><strong>Income starts with retirement</strong><span>{result ? `The ${dollars(result.annualRetirementIncome)} you entered offsets` : "Any retirement income you enter offsets"} spending from day one.</span></li>
        </ul>
        <p className="cf-limitations">
          Not modeled: taxes, fees, account types, healthcare, one-off costs, changing spending,
          income that starts later, or sequence-of-returns risk. This is educational information,
          not financial advice.
        </p>
      </section>

      <section className="cf-cross-sell">
        <div className="shell cf-cross-sell-inner">
          <p className="section-kicker light">THE NUMBER IS THE EASY PART</p>
          <h2>Have you reached it—and can you really coast?</h2>
          <p>
            Connect your financial life and ask what working less could look like. Linc brings your holdings, spending, and income into the analysis, then helps you test the what-ifs against real market history.
          </p>
          <ul className="cf-decision-list">
            {DECISIONS.map((question) => <li key={question}>{question}</li>)}
          </ul>
          {/*
            * `coast_fire_plan_cta` is a contract with the beachhead scorecard,
            * not a free-form label: its final funnel stage counts
            * `start_free_click` with exactly this `cta_location`
            * (COAST_FIRE_EXPERIMENT.planCtaLocation in
            * src/marketing-analytics/beachhead-scorecard.ts). Rename it and
            * that stage reports zero forever.
            */}
          <MarketingGetStartedButton
            className="button button-primary"
            trackingLocation="coast_fire_plan_cta"
            csOverrideId="cta-stress-test-coast-fire"
            label="Stress-test my Coast FIRE plan"
            href={COAST_FIRE_SIGNUP_HREF}
            /*
             * Carries no run. The email form is the way into Ask Linc with
             * one, and a scenario stored by an earlier run lives for two
             * hours, so leaving it in place would hand signup a run this
             * click did not ask for.
             */
            onBeforeNavigate={clearCoastFireSignupContext}
          />
          <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
        </div>
      </section>

      {children}

      <section className="shell cf-related">
        <span>NEED THE FULL RETIREMENT MODEL?</span>
        <p>Test contributions, retirement dates, Social Security timing, and real historical market sequences.</p>
        <Link href="/retirement-calculator" data-cs-override-id="coast-fire-to-retirement-calculator">
          Open the retirement calculator →
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
