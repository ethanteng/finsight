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

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  calculateCoastFire,
  DEFAULT_COAST_FIRE_INPUTS,
  type CoastFireInputs,
  type CoastFireResult,
} from "@/lib/coast-fire";
import { pushCoastFireCalculated } from "@/lib/dataLayer";
import { fromGrouped, withCommas } from "@/lib/number-input";
import {
  COAST_FIRE_SIGNUP_HREF,
  storeCoastFireSignupContext,
} from "@/lib/coast-fire-signup-context";
import { CoastFireEmailCapture } from "./CoastFireEmailCapture";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { SiteFooter, SiteHeader } from "./SiteShell";
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

const INITIAL_FORM: FormState = Object.fromEntries(
  Object.entries(DEFAULT_COAST_FIRE_INPUTS).map(([key, value]) => [
    key,
    MONEY_FIELDS.has(key as keyof CoastFireInputs)
      ? withCommas(String(value))
      : String(value),
  ]),
) as FormState;

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

function percent(value: number): string {
  if (!Number.isFinite(value)) return "Fully covered";
  return `${Math.round(value * 100)}%`;
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
    Object.entries(form).map(([key, value]) => [
      key,
      MONEY_FIELDS.has(key as keyof CoastFireInputs) ? fromGrouped(value) : Number(value),
    ]),
  ) as unknown as CoastFireInputs;
}

/**
 * The handoff into signup: the seven numbers as entered, nothing derived.
 *
 * This used to translate them into the retirement calculator's scenario shape,
 * which meant a Coast FIRE visitor landed on a page framed around a retirement
 * plan they had not run. The signup page recomputes the Coast FIRE figures
 * from these inputs instead, so both entry points — this button and the link
 * in the results email — continue the same decision.
 */
function signupContext(result: CoastFireResult): CoastFireInputs {
  return {
    currentAge: result.currentAge,
    retirementAge: result.retirementAge,
    currentSavings: result.currentSavings,
    annualRetirementSpending: result.annualRetirementSpending,
    annualRetirementIncome: result.annualRetirementIncome,
    realReturnRate: result.realReturnRate,
    withdrawalRate: result.withdrawalRate,
  };
}

function ResultPanel({ result }: { result: CoastFireResult }) {
  const progress = Number.isFinite(result.fundedRatio)
    ? Math.min(100, Math.max(0, result.fundedRatio * 100))
    : 100;

  return (
    <aside className="cf-result-card" aria-live="polite" data-cs-mask>
      <div className="cf-result-topline">
        <span>YOUR COAST FIRE STATUS</span>
        <strong className={result.hasReachedCoastFire ? "is-reached" : "is-building"}>
          {result.hasReachedCoastFire ? "Reached" : "Not yet"}
        </strong>
      </div>
      <h2>{result.hasReachedCoastFire ? "You’ve reached Coast FIRE." : "You’re still building your coast."}</h2>
      <p className="cf-result-lead">
        {result.portfolioSpendingNeed === 0
          ? "The retirement income you entered covers your planned spending, so this formula asks nothing of your portfolio."
          : result.hasReachedCoastFire
            ? `You are ${dollars(result.differenceToday)} above the amount this formula says you need invested today.`
            : `You are ${dollars(Math.abs(result.differenceToday))} short of your Coast FIRE number today.`}
      </p>

      <div className="cf-number-block">
        <span>Your Coast FIRE number</span>
        <strong>{dollars(result.coastFireNumber)}</strong>
        <small>in today’s dollars</small>
      </div>

      <div className="cf-progress-label">
        <span>Current retirement savings</span>
        <b>{percent(result.fundedRatio)}</b>
      </div>
      <div
        className="cf-progress"
        role="img"
        aria-label={`${percent(result.fundedRatio)} of the Coast FIRE number funded`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <strong className="cf-current-savings">{dollars(result.currentSavings)}</strong>

      <dl className="cf-result-metrics">
        <div>
          <dt>Target at {result.retirementAge}</dt>
          <dd>{dollars(result.retirementTarget)}</dd>
        </div>
        <div>
          <dt>If you add $0</dt>
          <dd>{dollars(result.projectedSavingsAtRetirement)}</dd>
        </div>
      </dl>
      <p className="cf-result-note">
        Assumes {result.realReturnRate}% annual growth after inflation for {result.yearsToRetirement} years
        and a {result.withdrawalRate}% starting withdrawal rate.
      </p>
    </aside>
  );
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
          required
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
  const [result, setResult] = useState<CoastFireResult>(() => calculateCoastFire(DEFAULT_COAST_FIRE_INPUTS));
  const [error, setError] = useState<string | null>(null);
  /*
   * The email capture waits for a submitted run. The page opens with a default
   * scenario already answered, and asking for an address against figures the
   * visitor has not entered collects the wrong thing — and would send someone
   * an email about a stranger's retirement.
   */
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const defaultResultReported = useRef(false);

  /*
   * The page answers before it is asked: the default scenario is on screen at
   * first paint and the plan CTA is live beside it. Reporting only submitted
   * runs would drop every visitor who accepts the defaults and clicks through,
   * because the scorecard counts a plan CTA only when a result is timestamped
   * ahead of it in the same session.
   *
   * useLayoutEffect (not useEffect) so the result timestamp is recorded before
   * the browser paints and a fast click on the already-visible plan CTA cannot
   * beat it. With only first-event timestamps, a CTA that lands first can never
   * satisfy the scorecard's result-then-CTA ordering check.
   */
  useLayoutEffect(() => {
    if (defaultResultReported.current) return;
    defaultResultReported.current = true;
    const initial = calculateCoastFire(DEFAULT_COAST_FIRE_INPUTS);
    pushCoastFireCalculated(
      initial.hasReachedCoastFire ? "reached" : "not_yet",
      initial.yearsToRetirement,
      "default",
    );
  }, []);

  const sensitivity = useMemo(() => {
    const rates = [
      Math.max(0, result.realReturnRate - 1),
      result.realReturnRate,
      Math.min(12, result.realReturnRate + 1),
    ];
    return [...new Set(rates)].map((rate) => ({
      rate,
      coastFireNumber: calculateCoastFire({ ...result, realReturnRate: rate }).coastFireNumber,
      selected: rate === result.realReturnRate,
    }));
  }, [result]);

  const setField = (field: keyof CoastFireInputs) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const nextResult = calculateCoastFire(parseForm(form));
      setResult(nextResult);
      setError(null);
      setHasSubmitted(true);
      pushCoastFireCalculated(
        nextResult.hasReachedCoastFire ? "reached" : "not_yet",
        nextResult.yearsToRetirement,
        "submitted",
      );
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check your numbers and try again.");
    }
  }

  return (
    <main className="marketing-site subpage coast-fire-page">
      <SiteHeader />

      <section className="shell cf-hero">
        <p className="eyebrow"><span className="pulse" aria-hidden="true" /> Free calculator · no account needed</p>
        <h1>Have I reached <em>Coast FIRE?</em></h1>
        <p className="cf-hero-sub">
          Find what you need invested today to reach retirement without adding another dollar.
          Then see what that answer actually lets you change.
        </p>
      </section>

      <section className="shell cf-calculator" id="coast-calculator">
        <form className="cf-form" onSubmit={handleSubmit}>
          <div className="cf-form-head">
            <p className="section-kicker">SEVEN NUMBERS</p>
            <h2>Your coast</h2>
            <p className="cf-form-note">
              Use today’s dollars throughout. Count only income that starts the day you retire.
            </p>
          </div>

          <div className="cf-form-grid">
            <CalculatorField id="currentAge" label="Your age today" value={form.currentAge} onChange={setField("currentAge")} suffix="years" min={18} max={90} />
            <CalculatorField id="retirementAge" label="Retirement age" value={form.retirementAge} onChange={setField("retirementAge")} suffix="years" min={30} max={95} />
            <CalculatorField id="currentSavings" label="Retirement savings today" value={form.currentSavings} onChange={setField("currentSavings")} prefix="$" min={0} max={100_000_000} />
            <CalculatorField id="annualRetirementSpending" label="Annual spending in retirement" value={form.annualRetirementSpending} onChange={setField("annualRetirementSpending")} prefix="$" min={1_000} max={10_000_000} hint="Whole household, after tax." />
            <CalculatorField id="annualRetirementIncome" label="Annual income available at retirement" value={form.annualRetirementIncome} onChange={setField("annualRetirementIncome")} prefix="$" min={0} max={10_000_000} hint="Social Security, a pension, or other reliable income that starts on your retirement date." />
            <CalculatorField id="realReturnRate" label="Expected real return" value={form.realReturnRate} onChange={setField("realReturnRate")} suffix="%" min={0} max={12} step="0.1" hint="Growth after inflation." />
            <CalculatorField id="withdrawalRate" label="Withdrawal rate" value={form.withdrawalRate} onChange={setField("withdrawalRate")} suffix="%" min={2} max={8} step="0.1" hint="The share of the portfolio you spend in year one." />
          </div>

          {error && <p className="cf-form-error" role="alert">{error}</p>}
          <button className="button button-primary cf-calculate-button" type="submit" data-cs-override-id="coast-fire-calculate">
            Calculate my Coast FIRE number <span aria-hidden="true">→</span>
          </button>
          <p className="cf-private-note">The calculation runs in your browser. No account or email required.</p>
        </form>

        <div className="cf-result-column" ref={resultRef}>
          <ResultPanel result={result} />
        </div>

        {/*
          * Full width beneath both cards rather than stacked under the result.
          * The form and the result are a matched pair sized as one row; a
          * third card inside the right column made that column the taller of
          * the two and turned a balanced row into a lopsided one.
          */}
        {hasSubmitted && (
          <div className="cf-email-band">
            <CoastFireEmailCapture
              // Remount when the submitted scenario changes so a prior "sent"
              // state cannot claim to belong to a newly calculated result.
              key={[
                result.currentAge,
                result.retirementAge,
                result.currentSavings,
                result.annualRetirementSpending,
                result.annualRetirementIncome,
                result.realReturnRate,
                result.withdrawalRate,
              ].join(':')}
              result={result}
            />
          </div>
        )}
      </section>

      <section className="shell cf-sensitivity">
        <div className="cf-section-head">
          <p className="section-kicker">SEE WHAT CHANGES</p>
          <h2>Your return assumption does most of the work.</h2>
          <p>
            One point either way compounds for {result.yearsToRetirement} years. A single green badge
            should never be the end of the decision.
          </p>
        </div>
        <div className="cf-sensitivity-table" role="table" aria-label="Coast FIRE number by real return assumption" data-cs-mask>
          <div className="cf-sensitivity-row cf-sensitivity-head" role="row">
            <span role="columnheader">Real return</span>
            <span role="columnheader">Coast FIRE number today</span>
            <span role="columnheader">Status</span>
          </div>
          {sensitivity.map((scenario) => {
            const reached = result.currentSavings >= scenario.coastFireNumber;
            return (
              <div className={`cf-sensitivity-row${scenario.selected ? " is-selected" : ""}`} role="row" key={scenario.rate}>
                <span role="cell">{scenario.rate.toFixed(1)}%{scenario.selected ? " · yours" : ""}</span>
                <strong role="cell">{dollars(scenario.coastFireNumber)}</strong>
                <span role="cell" className={reached ? "is-reached" : "is-building"}>{reached ? "Reached" : "Not yet"}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="shell cf-assumptions">
        <div className="cf-section-head">
          <p className="section-kicker">WHAT THIS RESULT ASSUMES</p>
          <h2>Simple enough to check.</h2>
        </div>
        <ul>
          <li><strong>Constant real growth</strong><span>Your portfolio earns the same after-inflation return every year until retirement.</span></li>
          <li><strong>No more contributions</strong><span>The projection adds $0 from today through age {result.retirementAge}.</span></li>
          <li><strong>One withdrawal rate</strong><span>Your retirement target is annual portfolio spending divided by {result.withdrawalRate}%.</span></li>
          <li><strong>Income starts with retirement</strong><span>The {dollars(result.annualRetirementIncome)} you entered offsets spending from day one.</span></li>
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
            Ask Linc replaces the flat return and withdrawal rate above with your actual holdings,
            spending, income, and timing, then runs the change you are considering against a century
            of real market history.
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
            onBeforeNavigate={() => storeCoastFireSignupContext(signupContext(result))}
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
