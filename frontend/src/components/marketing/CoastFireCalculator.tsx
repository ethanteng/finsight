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

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

/**
 * How long the page waits for the reading before giving up on it.
 *
 * A deadline of our own, past the server's. The endpoint bounds its own model
 * call and answers 204 when it gives up, so this should never fire on an
 * ordinarily slow reading — it is the backstop for a connection that stops
 * answering, which would otherwise leave the placeholder spinning for as long
 * as the browser's own timeout allows.
 */
const INTERPRETATION_TIMEOUT_MS = 30_000;

/**
 * The model's reading of a result. Everything in it is prose; every figure
 * inside that prose was checked against the formula's own output before it was
 * sent, and a draft that failed that check is not sent at all — which is why
 * this is optional everywhere below rather than part of the result.
 */
interface Interpretation {
  headline: string;
  paragraphs: string[];
  watchOuts: string[];
  model: string;
}

/**
 * Ask for a reading of a submitted scenario.
 *
 * Only ever called for a scenario the visitor actually submitted. The page
 * opens with empty personal figures and no result, so there is nothing to
 * read until they ask — and asking on load would spend a model call and a
 * slice of their rate limit on every page view.
 *
 * Everything here fails to `null`, which renders as nothing: a visitor who
 * never learns the panel exists has still had a complete answer, because the
 * answer was computed in their browser before this request was made.
 */
function useCoastFireInterpretation(submitted: CoastFireInputs | null): {
  interpretation: Interpretation | null;
  isLoading: boolean;
} {
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!submitted || typeof fetch !== "function") return;

    let cancelled = false;
    setInterpretation(null);
    setIsLoading(true);

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const deadline = controller
      ? setTimeout(() => controller.abort(), INTERPRETATION_TIMEOUT_MS)
      : null;

    fetch(`${API_URL}/api/coast-fire/interpretation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submitted),
      ...(controller ? { signal: controller.signal } : {}),
    })
      // 204 is the ordinary "nothing to show" answer and has no body to read.
      .then((response) => (response.ok && response.status !== 204 ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const usable =
          payload &&
          typeof payload.headline === "string" &&
          Array.isArray(payload.paragraphs) &&
          payload.paragraphs.length > 0;
        setInterpretation(usable ? (payload as Interpretation) : null);
      })
      .catch(() => {
        if (!cancelled) setInterpretation(null);
      })
      .finally(() => {
        if (deadline !== null) clearTimeout(deadline);
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (deadline !== null) clearTimeout(deadline);
      // A new scenario supersedes this one; nothing is waiting on the answer.
      controller?.abort();
    };
  }, [submitted]);

  return { interpretation, isLoading };
}

/** The anchor the chevrons under the result jump to. */
const INTERPRETATION_ID = "what-this-means";

/**
 * Whether the reading panel will render anything at all.
 *
 * The panel and the chevrons that point at it both read this, so a chevron can
 * never be left pointing at a section that did not render. A reading is
 * dropped only when the model returns nothing usable, which is rarer than it
 * once was but still has to render as nothing rather than as an empty box.
 */
function hasInterpretation(interpretation: Interpretation | null, isInterpreting: boolean): boolean {
  return Boolean(interpretation) || isInterpreting;
}

/**
 * The shortcut from the result down to what the model made of it.
 *
 * Three chevrons cascading downward rather than a labelled pill: it sits under
 * the email capture's own button, and two filled controls stacked read as
 * competing asks. A wordless gesture says "keep going" without competing with
 * the thing being asked for. The name survives for anyone not looking at it —
 * screen readers, and the link's own title.
 *
 * Same component as `/retirement-calculator`, deliberately: it is the same
 * gesture doing the same job two clicks apart.
 */
function JumpToInterpretation({
  interpretation,
  isInterpreting,
}: {
  interpretation: Interpretation | null;
  isInterpreting: boolean;
}) {
  if (!hasInterpretation(interpretation, isInterpreting)) return null;

  return (
    <a
      className="cf-jump"
      href={`#${INTERPRETATION_ID}`}
      aria-label="See what this result means"
      title="See what this result means"
    >
      {[0, 1, 2].map((index) => (
        <svg
          key={index}
          className="cf-chevron"
          style={{ animationDelay: `${index * 0.16}s` }}
          viewBox="0 0 24 14"
          width="26"
          height="15"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2 2 L12 11 L22 2"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </a>
  );
}

/** The model's reading, or nothing. */
function InterpretationPanel({
  interpretation,
  isInterpreting,
}: {
  interpretation: Interpretation | null;
  isInterpreting: boolean;
}) {
  if (!hasInterpretation(interpretation, isInterpreting)) return null;

  return (
    <section
      className="shell cf-interpretation"
      id={INTERPRETATION_ID}
      aria-live="polite"
      aria-busy={isInterpreting}
    >
      <p className="section-kicker">WHAT THIS RESULT MEANS</p>
      {isInterpreting || !interpretation ? (
        <div className="cf-interpretation-loading" role="status">
          <span className="cf-interpretation-pulse" aria-hidden="true" />
          Reading your result&hellip;
        </div>
      ) : (
        <>
          <h3>{interpretation.headline}</h3>
          {interpretation.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {interpretation.watchOuts.length > 0 && (
            <ul className="cf-interpretation-watch">
              {interpretation.watchOuts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
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
  return (
    <aside className="cf-result-card is-empty">
      <div className="cf-result-topline">
        <span>YOUR COAST FIRE STATUS</span>
      </div>
      <h2>Your number, once you fill in the form.</h2>
      <p className="cf-result-lead">
        Coast FIRE is the amount that, left alone and compounding, would reach your retirement
        target without another dollar added. Fill in the form and this card will show that
        amount, how much of it your savings already cover, and what today&rsquo;s savings would
        grow to if you never added to them again.
      </p>
    </aside>
  );
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
  /*
   * Null until the visitor asks for an answer.
   *
   * The page used to open on a worked example already answered, which reads as
   * a result they have rather than an illustration of one — and everything
   * downstream inherited that: the email capture, the reading, and the
   * sensitivity table all had figures to talk about before anyone had entered
   * anything. One piece of state now gates all of it.
   */
  const [result, setResult] = useState<CoastFireResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * The scenario the reading is written from. Set only on submit, and only to
   * the seven numbers the calculator accepted — so the panel is always about
   * the figures on screen, and a page view never costs a model call.
   */
  const [submitted, setSubmitted] = useState<CoastFireInputs | null>(null);
  /** Runs this visitor has spent in this tab. Hydrated from storage on mount. */
  const [runCount, setRunCount] = useState(0);
  const locked = isRunLimitReached(runCount);
  useCalculatorLimitTracking('coast_fire', locked);
  const resultRef = useRef<HTMLDivElement>(null);

  const { interpretation, isLoading: isInterpreting } = useCoastFireInterpretation(submitted);

  const sensitivity = useMemo(() => {
    if (!result) return [];
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
    setResult(null);
    setSubmitted(null);
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
      setError(null);
      setSubmitted(signupContext(nextResult));
      // Only a run that produced a number counts. A refused form is not one of
      // this visitor's allowance.
      setRunCount(recordRun(COAST_FIRE_RUN_COUNT_KEY, runCount));
      pushCoastFireCalculated(
        nextResult.hasReachedCoastFire ? "reached" : "not_yet",
        nextResult.yearsToRetirement,
      );
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (caught) {
      refuse(caught instanceof Error ? caught.message : "Check your numbers and try again.");
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
          {/*
            * The standalone note this used to carry said two things. One
            * ("count only income that starts the day you retire") the income
            * field's own hint already says, in more detail and next to the box
            * it governs. The other rides on the kicker, which costs no height
            * — and height is the whole point: what the form gives up, the
            * capture band below the result gets back, above the fold.
            */}
          <div className="cf-form-head">
            <p className="section-kicker">SEVEN NUMBERS · TODAY’S DOLLARS</p>
            <h2>Your coast</h2>
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
              That is {runLimitPhrase()}. Save this one to a free account to keep
              changing the numbers — you will get the same calculator with your own accounts
              behind it, and this run waiting as your first decision.
            </p>
          )}
        </form>

        <div className="cf-result-column" ref={resultRef}>
          {result ? <ResultPanel result={result} /> : <EmptyResultPanel />}
        </div>

        {/*
          * Full width beneath both cards rather than stacked under the result.
          * The form and the result are a matched pair sized as one row; a
          * third card inside the right column made that column the taller of
          * the two and turned a balanced row into a lopsided one.
          */}
        {result && (
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

        {/*
          * The reading is the next thing worth having, and it is below the
          * fold from here — past the capture band someone has just finished
          * with. This is the shortcut to it, kept with the result it reads.
          */}
        <JumpToInterpretation interpretation={interpretation} isInterpreting={isInterpreting} />
      </section>

      <InterpretationPanel interpretation={interpretation} isInterpreting={isInterpreting} />

      {/*
        * Nothing but a comparison of computed answers, so it waits for one.
        * The assumptions below it do not: they describe the formula rather
        * than any run of it, and they are worth reading — and worth
        * indexing — before anyone has typed anything.
        */}
      {result && (
      <section className="shell cf-sensitivity">
        <div className="cf-section-head">
          <p className="section-kicker">SEE WHAT CHANGES</p>
          <h2>Your return assumption does most of the work.</h2>
          <p>
            One point either way compounds for {result?.yearsToRetirement} years. A single green
            badge should never be the end of the decision.
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
      )}

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
            /*
             * The handoff carries what this page is showing, including when
             * that is nothing. A scenario stored by an earlier run lives for
             * two hours, so leaving it in place here would hand signup a run
             * the visitor did not just see — the same answer-they-did-not-ask
             * -for this page was emptied to avoid.
             */
            onBeforeNavigate={() => {
              if (result) storeCoastFireSignupContext(signupContext(result));
              else clearCoastFireSignupContext();
            }}
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
