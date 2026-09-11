"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  calculateCoastFire,
  DEFAULT_COAST_FIRE_INPUTS,
  type CoastFireInputs,
  type CoastFireResult,
} from "@/lib/coast-fire";
import { pushCoastFireCalculated } from "@/lib/dataLayer";
import {
  RETIREMENT_SIGNUP_HREF,
  storeRetirementSignupContext,
} from "@/lib/retirement-signup-context";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { TRIAL_CTA_MICROCOPY } from "./trial-copy";

type FormState = Record<keyof CoastFireInputs, string>;

const INITIAL_FORM: FormState = Object.fromEntries(
  Object.entries(DEFAULT_COAST_FIRE_INPUTS).map(([key, value]) => [key, String(value)]),
) as FormState;

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

function parseForm(form: FormState): CoastFireInputs {
  const parsed = Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, Number(value)]),
  ) as unknown as CoastFireInputs;
  return parsed;
}

function signupContext(result: CoastFireResult) {
  return {
    currentAge: result.currentAge,
    retirementAge: result.retirementAge,
    investableAssets: result.currentSavings,
    annualSpending: result.annualRetirementSpending,
    annualContributions: 0,
    socialSecurityAnnual: Math.min(result.annualRetirementIncome, 250_000),
    socialSecurityStartAge: Math.max(50, Math.min(80, result.retirementAge)),
    lifeExpectancy: Math.max(95, result.retirementAge + 1),
    allocation: "balanced" as const,
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
          ? "The retirement income you entered covers your planned spending, so this simple formula does not require an investment target."
          : result.hasReachedCoastFire
            ? `Your current savings are ${dollars(result.differenceToday)} above the amount this formula says you need today.`
            : `You are ${dollars(Math.abs(result.differenceToday))} short of your Coast FIRE number today.`}
      </p>

      <div className="cf-number-block">
        <span>Your Coast FIRE number</span>
        <strong>{dollars(result.coastFireNumber)}</strong>
        <small>in today&apos;s dollars</small>
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
        Assumes {result.realReturnRate}% annual growth after inflation for {result.yearsToRetirement} years and a {result.withdrawalRate}% starting withdrawal rate.
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
  return (
    <div className="cf-field">
      <label htmlFor={id}>{label}</label>
      <div className="cf-input-wrap">
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
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
  const resultRef = useRef<HTMLDivElement>(null);

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
      pushCoastFireCalculated(
        nextResult.hasReachedCoastFire ? "reached" : "not_yet",
        nextResult.yearsToRetirement,
      );
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check your numbers and try again.");
    }
  }

  return (
    <main className="marketing-site coast-fire-page coast-fire-calculator-page">
      <SiteHeader />

      <section className="shell cf-calculator-intro">
        <p className="eyebrow"><span className="pulse" aria-hidden="true" /> Free calculator · no account needed</p>
        <h1>Have I reached <em>Coast FIRE?</em></h1>
        <p>
          Find the amount you need invested today for retirement—if you never add another dollar.
          Then see how much the answer moves when your assumptions do.
        </p>
      </section>

      <section className="shell cf-calculator-shell" id="coast-calculator">
        <form className="cf-form" onSubmit={handleSubmit}>
          <div className="cf-form-heading">
            <p className="section-kicker">YOUR NUMBERS</p>
            <h2>Calculate your coast.</h2>
            <p>Use today&apos;s dollars throughout. Retirement income should only include money available from the day you retire.</p>
          </div>

          <div className="cf-form-grid">
            <CalculatorField id="currentAge" label="Your age today" value={form.currentAge} onChange={setField("currentAge")} suffix="years" min={18} max={90} />
            <CalculatorField id="retirementAge" label="Retirement age" value={form.retirementAge} onChange={setField("retirementAge")} suffix="years" min={30} max={95} />
            <CalculatorField id="currentSavings" label="Retirement savings today" value={form.currentSavings} onChange={setField("currentSavings")} prefix="$" min={0} max={100_000_000} />
            <CalculatorField id="annualRetirementSpending" label="Annual spending in retirement" value={form.annualRetirementSpending} onChange={setField("annualRetirementSpending")} prefix="$" min={1_000} max={10_000_000} hint="Whole household, after tax." />
            <CalculatorField id="annualRetirementIncome" label="Annual income available at retirement" value={form.annualRetirementIncome} onChange={setField("annualRetirementIncome")} prefix="$" min={0} max={10_000_000} hint="Social Security, pension, or other reliable income available from your retirement date." />
            <CalculatorField id="realReturnRate" label="Expected real return" value={form.realReturnRate} onChange={setField("realReturnRate")} suffix="%" min={0} max={12} step="0.1" hint="Growth after inflation." />
            <CalculatorField id="withdrawalRate" label="Withdrawal rate" value={form.withdrawalRate} onChange={setField("withdrawalRate")} suffix="%" min={2} max={8} step="0.1" hint="The share of your retirement portfolio spent in year one." />
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
      </section>

      <section className="cf-after-number">
        <div className="shell cf-after-grid">
          <div>
            <p className="section-kicker light">THE NUMBER IS THE EASY PART</p>
            <h2>But does this mean you should actually stop contributing?</h2>
          </div>
          <div className="cf-after-copy">
            <p>
              A Coast FIRE number is a useful threshold, not a financial plan. Ask Linc can replace
              the flat return and withdrawal assumptions with your actual holdings, spending,
              income, and the life change you are considering.
            </p>
            <MarketingGetStartedButton
              className="button button-primary"
              trackingLocation="coast_fire_calculator_result"
              csOverrideId="cta-stress-test-coast-fire-calculator"
              label="Stress-test my Coast FIRE plan"
              href={RETIREMENT_SIGNUP_HREF}
              onBeforeNavigate={() => storeRetirementSignupContext(signupContext(result))}
            />
            <p className="microcopy">{TRIAL_CTA_MICROCOPY}</p>
          </div>
        </div>
      </section>

      <section className="shell cf-sensitivity">
        <div className="cf-section-heading">
          <p className="section-kicker">SEE WHAT CHANGES</p>
          <h2>Your return assumption does a lot of work.</h2>
          <p>
            A one-point change compounds for {result.yearsToRetirement} years. That is why a single green badge should never be the end of the decision.
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
        <div>
          <p className="section-kicker">WHAT THIS RESULT ASSUMES</p>
          <h2>Simple enough to inspect.</h2>
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

      {children}

      <section className="shell cf-related">
        <span>NEED THE FULL RETIREMENT MODEL?</span>
        <p>Test contributions, retirement dates, Social Security timing, and real historical market sequences.</p>
        <Link href="/retirement-calculator">Open the retirement calculator →</Link>
      </section>

      <SiteFooter />
    </main>
  );
}
