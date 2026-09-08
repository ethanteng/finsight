"use client";

/**
 * The retirement decision page: six numbers in, the real model's output back.
 *
 * There is deliberately no chat box anywhere on this page. The visitor is not
 * asking a question and getting a paragraph — they are entering a plan and
 * getting the deterministic engine's answer, the same one the authenticated
 * product runs. Everything the model had to assume on their behalf is named on
 * the page, because that gap is the reason to connect real accounts.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { MarketingGetStartedButton } from "./MarketingGetStartedButton";
import { SiteFooter, SiteHeader } from "./SiteShell";
import { RetirementConnectedExample } from "./RetirementConnectedExample";
import { pushRetirementModelRun } from "@/lib/dataLayer";
import { trackContentsquareEvent } from "@/lib/contentsquare";

type AllocationId = "conservative" | "balanced" | "growth";

interface Scenario {
  id: string;
  label: string;
  change: string | null;
  retirementAge: number;
  annualSpending: number;
  survivalRate: number;
  sequencesTested: number;
  sequencesSurvived: number;
  projectedPortfolioAtRetirement: number;
  firstYearPortfolioWithdrawal: number;
  firstYearWithdrawalRate: number;
  depletionYears: { p10: number | null; p25: number | null; p50: number | null } | null;
  primaryObservation: string;
  characteristics: {
    growthPotential: string;
    drawdownResistance: string;
    withdrawalFragility: string;
    inflationProtection: string;
  };
  tradeoffs: { upside: string; downside: string };
}

interface QuickPlanResult {
  inputs: {
    currentAge: number;
    retirementAge: number;
    investableAssets: number;
    annualSpending: number;
    annualContributions: number;
    socialSecurityAnnual: number;
    socialSecurityStartAge: number;
    lifeExpectancy: number;
    allocation: AllocationId;
  };
  allocation: { id: AllocationId; label: string; description: string; equityPercent: number };
  history: {
    firstMonth: string;
    lastMonth: string;
    sequencesTested: number;
    horizonYears: number;
    firstStartMonth: string;
    lastStartMonth: string;
  };
  primary: Scenario;
  alternatives: Scenario[];
  sustainableSpending: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    solverFloorRate: number;
    solverCeilingRate: number;
  };
  assumptions: string[];
  limitations: string[];
}

interface AllocationOption {
  id: AllocationId;
  label: string;
  description: string;
}

/**
 * Rendered immediately so the form is complete in the first paint — an ad
 * landing page cannot afford a spinner where its inputs go. `GET /options` is
 * the authority, though, and `useAllocations` replaces these as soon as it
 * answers, so a preset changed on the server cannot silently drift from the
 * form the visitor fills in.
 */
const FALLBACK_ALLOCATIONS: AllocationOption[] = [
  { id: "conservative", label: "Conservative", description: "40% US stocks · 50% bonds · 10% cash" },
  { id: "balanced", label: "Balanced", description: "60% US stocks · 35% bonds · 5% cash" },
  { id: "growth", label: "Growth", description: "80% US stocks · 18% bonds · 2% cash" },
];

const ALLOCATION_IDS = new Set<string>(FALLBACK_ALLOCATIONS.map((option) => option.id));

function useAllocations(): AllocationOption[] {
  const [allocations, setAllocations] = useState(FALLBACK_ALLOCATIONS);

  useEffect(() => {
    // A missing fetch throws synchronously, which no `.catch` on the chain
    // would see. The fallback presets are already rendered, so there is
    // nothing to recover.
    if (typeof fetch !== "function") return;

    let cancelled = false;

    fetch(`${API_URL}/api/retirement-quickplan/options`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const served = payload?.allocations;
        if (cancelled || !Array.isArray(served) || served.length === 0) return;

        // The server's own wording, but only for presets this form knows how to
        // submit — an unrecognised id would render an option the request would
        // then be rejected for.
        const usable = served.filter(
          (option): option is AllocationOption =>
            typeof option?.id === 'string' &&
            ALLOCATION_IDS.has(option.id) &&
            typeof option?.label === 'string' &&
            typeof option?.description === 'string'
        );
        if (usable.length > 0) setAllocations(usable);
      })
      // A failed lookup leaves the fallback in place; the form still works.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return allocations;
}

const SOCIAL_SECURITY_AGES = [62, 63, 64, 65, 66, 67, 68, 69, 70];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function withCommas(value: string): string {
  const digits = digitsOnly(value);
  return digits ? Number(digits).toLocaleString("en-US") : "";
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function compactMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

/**
 * Colour the headline by what the number actually says. A 45% survival rate
 * rendered in the same confident green as a 99% one is a lie of presentation.
 */
function outcomeBand(survivalRate: number): "strong" | "mixed" | "weak" {
  if (survivalRate >= 0.9) return "strong";
  if (survivalRate >= 0.7) return "mixed";
  return "weak";
}

function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** `1926-07` reads as a date, not a database column. */
function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const names = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${names[Number(match[2]) - 1]} ${match[1]}`;
}

/**
 * The engine's percentiles are positions in the withdrawal-rate distribution:
 * p10 is the conservative rate that 90% of histories survived. Visitors read
 * survival, not percentile rank, so they are labelled that way here.
 */
const SUSTAINABLE_BANDS: Array<{ key: "p10" | "p25" | "p50" | "p75" | "p90"; label: string }> = [
  { key: "p10", label: "9 in 10" },
  { key: "p25", label: "3 in 4" },
  { key: "p50", label: "1 in 2" },
  { key: "p75", label: "1 in 4" },
  { key: "p90", label: "1 in 10" },
];

interface FormState {
  currentAge: string;
  retirementAge: string;
  investableAssets: string;
  annualSpending: string;
  annualContributions: string;
  socialSecurityAnnual: string;
  socialSecurityStartAge: string;
  allocation: AllocationId;
}

/**
 * Retirement age is the one field left blank by default. It is the question the
 * page is asking, and a paid-search visitor arrives with it already answered by
 * the ad they clicked (`?retirement_age=62`), so prefilling a number nobody
 * chose would either contradict the headline or quietly become the default
 * answer for everyone who did not.
 */
function initialForm(retirementAge: number | null): FormState {
  return {
    currentAge: "",
    retirementAge: retirementAge === null ? "" : String(retirementAge),
    investableAssets: "",
    annualSpending: "",
    annualContributions: "",
    socialSecurityAnnual: "",
    socialSecurityStartAge: "67",
    allocation: "balanced",
  };
}

export function RetirementQuickPlan({
  headline,
  initialRetirementAge,
  children,
}: {
  /** Resolved on the server from the ad's retirement age, so it is in the first paint. */
  headline: string;
  initialRetirementAge: number | null;
  /**
   * Server-rendered evergreen content for the page — the explainer, FAQ and
   * cluster links. Passed in rather than written here so it stays out of this
   * client bundle and is in the HTML whether or not the model has been run.
   */
  children?: ReactNode;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(initialRetirementAge));
  const [result, setResult] = useState<QuickPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const allocations = useAllocations();
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const fieldEditedRef = useRef(false);
  const validationReportedRef = useRef(false);
  const requestInFlightRef = useRef(false);

  function trackStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    trackContentsquareEvent('retirement_calculator_started');
  }

  const setField = (field: keyof FormState) => (value: string) => {
    // Count actual user changes, not prefills, focus, validation, or submission.
    // Keep analytics outside the state updater (which React may replay).
    if (value !== form[field] && !fieldEditedRef.current) {
      fieldEditedRef.current = true;
      trackContentsquareEvent('retirement_calculator_field_edited');
    }
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    validationReportedRef.current = false;
    trackStarted();
    trackContentsquareEvent('retirement_model_requested');
    setError(null);
    setIsRunning(true);

    try {
      const response = await fetch(`${API_URL}/api/retirement-quickplan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentAge: Number(digitsOnly(form.currentAge)),
          retirementAge: Number(digitsOnly(form.retirementAge)),
          investableAssets: Number(digitsOnly(form.investableAssets)),
          annualSpending: Number(digitsOnly(form.annualSpending)),
          annualContributions: Number(digitsOnly(form.annualContributions) || "0"),
          socialSecurityAnnual: Number(digitsOnly(form.socialSecurityAnnual) || "0"),
          socialSecurityStartAge: Number(form.socialSecurityStartAge),
          allocation: form.allocation,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        trackContentsquareEvent('retirement_api_error');
        setError(payload?.error || "Could not run this plan. Please check the numbers and try again.");
        return;
      }

      setResult(payload as QuickPlanResult);
      // Let the results render before scrolling to them.
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      trackContentsquareEvent('retirement_request_error');
      setError("Could not reach the model. Please try again in a moment.");
    } finally {
      requestInFlightRef.current = false;
      setIsRunning(false);
    }
  }

  return (
    <main className="marketing-site subpage quickplan-page">
      <SiteHeader />

      <section className="shell qp-hero">
        <p className="eyebrow"><span className="pulse" aria-hidden="true" /> Retirement model · no account needed</p>
        <h1>{headline}</h1>
        <p className="qp-hero-sub">
          Enter six numbers. We run them through the same deterministic retirement engine Ask Linc
          uses on real accounts — a century of month-by-month market history, real inflation, real
          sequence risk — and show you what your plan would have done in every one of those
          retirements.
        </p>
        <p className="qp-hero-note">
          No chat box. No AI guessing at arithmetic. The same calculation, every time.
        </p>
      </section>

      <section className="shell qp-form-section">
        <form className="qp-form" onSubmit={handleSubmit}
          onChange={() => { trackStarted(); validationReportedRef.current = false; }}
          onInvalid={() => {
            trackStarted();
            // The browser can emit one invalid event for every empty field.
            if (!validationReportedRef.current) {
              validationReportedRef.current = true;
              trackContentsquareEvent('retirement_validation_error');
            }
          }}>
          <div className="qp-form-head">
            <p className="section-kicker">SIX NUMBERS</p>
            <h2>Your plan</h2>
          </div>

          <div className="qp-grid">
            <NumberField
              id="currentAge"
              label="Current age"
              value={form.currentAge}
              onChange={setField("currentAge")}
              placeholder="52"
              suffix="years"
            />
            <NumberField
              id="retirementAge"
              label="Retirement age"
              value={form.retirementAge}
              onChange={setField("retirementAge")}
              placeholder="60"
              suffix="years"
            />
            <MoneyField
              id="investableAssets"
              label="Investment assets today"
              hint="Retirement and brokerage accounts. Not your home."
              value={form.investableAssets}
              onChange={setField("investableAssets")}
              placeholder="1,200,000"
            />
            <MoneyField
              id="annualSpending"
              label="Annual spending in retirement"
              hint="Whole household, in today's dollars."
              value={form.annualSpending}
              onChange={setField("annualSpending")}
              placeholder="95,000"
            />
            <MoneyField
              id="annualContributions"
              label="Annual contributions until then"
              hint="What you add each year between now and retiring."
              value={form.annualContributions}
              onChange={setField("annualContributions")}
              placeholder="35,000"
            />
            <div className="qp-field qp-field-split">
              <label htmlFor="socialSecurityAnnual">Social Security estimate</label>
              <div className="qp-split-inputs">
                <div className="qp-input-wrap">
                  <span className="qp-prefix">$</span>
                  <input
                    id="socialSecurityAnnual"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    value={form.socialSecurityAnnual}
                    placeholder="36,000"
                    onChange={(event) => setField("socialSecurityAnnual")(withCommas(event.target.value))}
                  />
                  <span className="qp-suffix">/ year</span>
                </div>
                <div className="qp-start-age">
                  <label htmlFor="socialSecurityStartAge">starting at</label>
                  <select
                    id="socialSecurityStartAge"
                    value={form.socialSecurityStartAge}
                    onChange={(event) => setField("socialSecurityStartAge")(event.target.value)}
                  >
                    {SOCIAL_SECURITY_AGES.map((age) => (
                      <option key={age} value={age}>{age}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="qp-hint">
                Your annual benefit from ssa.gov, and the age you plan to claim it.
              </p>
            </div>
          </div>

          <fieldset className="qp-allocation">
            <legend>
              One thing we have to assume
              <span>We don&apos;t know what you actually own, and sequence risk depends on it. Pick the closest.</span>
            </legend>
            <div className="qp-allocation-options">
              {allocations.map((allocation) => (
                <label
                  key={allocation.id}
                  className={`qp-allocation-option${form.allocation === allocation.id ? " is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="allocation"
                    value={allocation.id}
                    checked={form.allocation === allocation.id}
                    onChange={() => setField("allocation")(allocation.id)}
                  />
                  <strong>{allocation.label}</strong>
                  <span>{allocation.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="qp-error" role="alert">{error}</p>}

          <div className="qp-submit-row">
            <button className="button button-primary" type="submit" disabled={isRunning} data-cs-override-id="quickplan-run-model"
              onClick={() => trackContentsquareEvent('retirement_model_clicked')}>
              {isRunning ? "Running the model…" : "Run the model"}
            </button>
            <p className="qp-submit-note">
              Nothing is saved, and nothing is sent anywhere but the calculation.
            </p>
          </div>
        </form>
      </section>

      <div ref={resultsRef}>
        {result && <QuickPlanResults result={result} />}
      </div>

      <RetirementConnectedExample />

      <section className="qp-cross-sell">
        <div className="shell qp-cross-sell-inner">
          <p className="section-kicker light">THE SAME ENGINE, WITH REAL INPUTS</p>
          <h2>
            {result
              ? "This analysis used six numbers."
              : "Six numbers gets you a real calculation. Your accounts get you a real answer."}
          </h2>
          <p>
            Ask Linc can replace those estimates with your actual accounts, spending, investments,
            debts and income — every holding, every fee, your real allocation, your real cash flow —
            and run this same model against them.
          </p>
          <MarketingGetStartedButton
            className="button button-primary"
            trackingLocation="quickplan_cross_sell"
            csOverrideId="cta-start-free-trial-quickplan"
          />
        </div>
      </section>

      {children}

      <SiteFooter />
    </main>
  );
}

function NumberField({
  id, label, value, onChange, placeholder, suffix, hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="qp-field">
      <label htmlFor={id}>{label}</label>
      <div className="qp-input-wrap">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          required
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(digitsOnly(event.target.value))}
        />
        {suffix && <span className="qp-suffix">{suffix}</span>}
      </div>
      {hint && <p className="qp-hint">{hint}</p>}
    </div>
  );
}

function MoneyField({
  id, label, value, onChange, placeholder, hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint?: string;
}) {
  return (
    <div className="qp-field">
      <label htmlFor={id}>{label}</label>
      <div className="qp-input-wrap">
        <span className="qp-prefix">$</span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          required
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(withCommas(event.target.value))}
        />
      </div>
      {hint && <p className="qp-hint">{hint}</p>}
    </div>
  );
}

function QuickPlanResults({ result }: { result: QuickPlanResult }) {
  const { primary, alternatives, history, inputs, allocation, sustainableSpending } = result;
  const reportedResultRef = useRef<QuickPlanResult | null>(null);
  useEffect(() => {
    if (reportedResultRef.current === result) return;
    reportedResultRef.current = result;
    // Count success only after the results commit to the page, not on a click.
    pushRetirementModelRun(result.inputs.retirementAge);
  }, [result]);

  const sustainableData = useMemo(
    () =>
      SUSTAINABLE_BANDS.map((band) => ({
        name: band.label,
        value: sustainableSpending[band.key],
      })),
    [sustainableSpending]
  );

  const scenarioRows = useMemo(
    () =>
      [primary, ...alternatives].map((scenario) => ({
        id: scenario.id,
        label: scenario.label,
        change: scenario.change,
        survivalRate: scenario.survivalRate,
        isPrimary: scenario.id === primary.id,
      })),
    [primary, alternatives]
  );

  const ranOut = primary.sequencesTested - primary.sequencesSurvived;
  const band = outcomeBand(primary.survivalRate);
  const claimsAfterRetiring = inputs.socialSecurityStartAge > inputs.retirementAge;

  return (
    <>
      <section className="shell qp-results" aria-live="polite">
        <p className="section-kicker">THE MODEL&apos;S ANSWER</p>
        <h2 className="qp-verdict" data-outcome={band}>
          Based on the numbers you entered, retiring at {inputs.retirementAge} worked in{" "}
          <strong>{primary.sequencesSurvived.toLocaleString("en-US")} of the{" "}
          {primary.sequencesTested.toLocaleString("en-US")}</strong>{" "}
          retirements in market history we could test it against.
        </h2>
        <p className="qp-verdict-sub">
          Each test is a real, month-by-month stretch of US market returns and inflation running from{" "}
          {monthLabel(history.firstStartMonth)} onward — {history.horizonYears} years from today
          through age {inputs.lifeExpectancy}, with your contributions before retirement and your
          spending after it.
        </p>

        <div
          className="qp-survival-bar"
          data-outcome={band}
          role="img"
          aria-label={`${percent(primary.survivalRate, 1)} of tested histories lasted`}
        >
          <div className="qp-survival-fill" style={{ width: `${primary.survivalRate * 100}%` }} />
          <span className="qp-survival-label">{percent(primary.survivalRate, 1)} lasted</span>
        </div>

        <div className="qp-stats">
          <Stat
            label={`Portfolio at age ${inputs.retirementAge}`}
            value={money(primary.projectedPortfolioAtRetirement)}
            note="Median across tested histories, in today's dollars"
          />
          <Stat
            label="First-year draw"
            value={money(primary.firstYearPortfolioWithdrawal)}
            note={
              claimsAfterRetiring
                ? `All of it from the portfolio — Social Security starts at ${inputs.socialSecurityStartAge}`
                : inputs.socialSecurityAnnual > 0
                  ? `Your spending less ${money(inputs.socialSecurityAnnual)} of Social Security`
                  : "No Social Security offset in the first year"
            }
          />
          <Stat
            label="Withdrawal rate"
            value={percent(primary.firstYearWithdrawalRate, 2)}
            note="First-year draw as a share of the portfolio"
          />
          <Stat
            label="Histories that ran short"
            value={ranOut.toLocaleString("en-US")}
            note={
              primary.depletionYears?.p50 != null
                ? `Money lasted about ${Math.round(primary.depletionYears.p50)} years in the median failure`
                : "The portfolio lasted in every tested history"
            }
          />
        </div>
      </section>

      <section className="shell qp-chart-block">
        <div className="qp-chart-copy">
          <p className="section-kicker">WHAT THE PORTFOLIO ALONE SUPPORTED</p>
          <h3>Spending history was willing to fund</h3>
          <p>
            The engine solves, for each level of confidence, the constant inflation-adjusted spending
            this mix sustained for {inputs.lifeExpectancy - inputs.retirementAge} years{" "}
            <strong>with no other income</strong>. Your plan draws{" "}
            <strong>{money(primary.firstYearPortfolioWithdrawal)}</strong> from the portfolio in its
            first year.
          </p>
          {claimsAfterRetiring ? (
            <p className="qp-chart-caveat">
              Social Security is not in this chart, and it is the reason these bars and the survival
              figure above can look like they disagree. Your plan draws that{" "}
              {money(primary.firstYearPortfolioWithdrawal)} only until age {inputs.socialSecurityStartAge};
              after that the portfolio covers{" "}
              {money(Math.max(0, inputs.annualSpending - inputs.socialSecurityAnnual))}. A flat line
              across the whole retirement is a harder test than your plan actually faces — the
              survival figure above is the one that counts your benefit.
            </p>
          ) : (
            <p className="qp-chart-caveat">
              Your Social Security has already started at this retirement age, so that draw is what
              the portfolio funds for the whole retirement and this comparison is like for like.
            </p>
          )}
          <p className="qp-chart-caveat">
            The solver searches between {percent(sustainableSpending.solverFloorRate)} and{" "}
            {percent(sustainableSpending.solverCeilingRate)} of the portfolio, so a bar at the top of
            the range means &ldquo;at least this much&rdquo;.
          </p>
        </div>
        <div className="qp-chart">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sustainableData} margin={{ top: 24, right: 84, bottom: 8, left: 0 }}>
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={{ stroke: "#ccd1c4" }}
                tick={{ fill: "#52705f", fontSize: 12 }}
                label={{ value: "histories that lasted", position: "insideBottom", offset: -4, fill: "#7d8a82", fontSize: 11 }}
              />
              <YAxis
                tickFormatter={compactMoney}
                tickLine={false}
                axisLine={false}
                width={58}
                tick={{ fill: "#7d8a82", fontSize: 11 }}
              />
              <ReferenceLine
                y={primary.firstYearPortfolioWithdrawal}
                stroke="#b4352b"
                strokeDasharray="5 4"
                label={{ value: "first year", position: "right", fill: "#b4352b", fontSize: 11 }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {sustainableData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.value >= primary.firstYearPortfolioWithdrawal ? "#2b8f5d" : "#d99b6f"}
                  />
                ))}
                {/* Inside the bar: above it, the shortest bar's label collides with the reference line. */}
                <LabelList dataKey="value" position="insideTop" offset={10} formatter={compactMoney} fill="#ffffff" fontSize={12} fontWeight={700} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="shell qp-scenarios">
        <div className="qp-scenarios-copy">
          <p className="section-kicker">WHAT MOVES THE ANSWER</p>
          <h3>The two levers these numbers can pull</h3>
          <p>
            Working longer and spending less are the only changes six numbers can express. Each row
            is a full re-run of the model against the same century of history — not an adjustment of
            the first answer.
          </p>
        </div>
        <ul className="qp-scenario-list">
          {scenarioRows.map((scenario) => (
            <li key={scenario.id} className={scenario.isPrimary ? "is-primary" : undefined}>
              <div className="qp-scenario-label">
                <strong>{scenario.label}</strong>
                <span>{scenario.change ?? "as you entered it"}</span>
              </div>
              <div className="qp-scenario-track">
                <div className="qp-scenario-fill" style={{ width: `${scenario.survivalRate * 100}%` }} />
              </div>
              <b>{percent(scenario.survivalRate, 1)}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="qp-honesty">
        <div className="shell qp-honesty-inner">
          <div>
            <p className="section-kicker light">WHAT THIS MODEL DID NOT KNOW</p>
            <h3>Six numbers is a real calculation. It is not your finances.</h3>
            <p className="qp-honesty-lede">
              These are the gaps between this answer and the one your actual accounts would produce.
              We would rather print them than let the chart imply precision it does not have.
            </p>
          </div>
          <ul className="qp-limitations">
            {result.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="shell qp-methodology">
        <div className="qp-observation">
          <p className="section-kicker">HOW THE ENGINE READ THIS ASSET MIX</p>
          <p className="qp-observation-quote">{primary.primaryObservation}.</p>
          <p className="qp-observation-detail">
            <strong>Upside:</strong> {primary.tradeoffs.upside}.{" "}
            <strong>Downside:</strong> {primary.tradeoffs.downside}.
          </p>
          <p className="qp-observation-scope">
            This describes the {allocation.label.toLowerCase()} mix we assumed for you across the
            tested history — not the outcome of your plan, and not your actual portfolio.
          </p>
          <dl className="qp-characteristics">
            <div><dt>Growth potential</dt><dd>{primary.characteristics.growthPotential}</dd></div>
            <div><dt>Drawdown resistance</dt><dd>{primary.characteristics.drawdownResistance}</dd></div>
            <div><dt>Withdrawal fragility</dt><dd>{primary.characteristics.withdrawalFragility}</dd></div>
            <div><dt>Inflation protection</dt><dd>{primary.characteristics.inflationProtection}</dd></div>
          </dl>
        </div>

        <details className="qp-assumptions">
          <summary>
            Every assumption the calculation made
            <span>
              {allocation.label} mix · {history.sequencesTested.toLocaleString("en-US")} overlapping{" "}
              {history.horizonYears}-year windows · {monthLabel(history.firstMonth)}–{monthLabel(history.lastMonth)}
            </span>
          </summary>
          <ul>
            {result.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
          <p className="qp-sources">
            Market history: Kenneth R. French Data Library (US equity, Treasury bills) and Robert J.
            Shiller (long-term government bonds, CPI). This is an informational model, not financial
            advice.
          </p>
        </details>
      </section>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="qp-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
