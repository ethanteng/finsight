/**
 * What the same question looks like once the model can read real accounts.
 *
 * The page's own result is computed live from six numbers, and the CTA under it
 * promises something better without showing it. This is that something: the
 * same shape of plan, run by the same engine, against a portfolio it actually
 * read instead of one it assumed.
 *
 * Every figure comes from `retirement-calculator-example.generated.ts`, written
 * by `npm run build:retirement-example` from a real engine run. Nothing here is
 * typed by hand, which is what lets the section claim these are the engine's
 * outputs.
 *
 * The panel answers the page's question first and shows its work second. The
 * three cards below it are the reasons to believe the answer — the mix it
 * found, the $464,272 it declined to simulate, its own low confidence rating —
 * but a visitor who reads only the first line should still learn whether this
 * plan retires at 60, and at which age it stops being a close call.
 *
 * That answer is a band across retirement ages rather than a single rate,
 * because a single rate answers "can I retire at 60?" and says nothing about
 * "when can I retire?" — and the page is bought against both.
 */

import { RETIREMENT_CALCULATOR_EXAMPLE as EXAMPLE } from "@/lib/retirement-calculator-example.generated";

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const names = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${names[Number(match[2]) - 1]} ${match[1]}`;
}

/**
 * Colour the answer by what it actually says, the same thresholds the live
 * result above uses. A 60% survival rate rendered in the same confident green
 * as a 100% one is a lie of presentation.
 */
function outcomeBand(survivalRate: number): "strong" | "mixed" | "weak" {
  if (survivalRate >= 0.9) return "strong";
  if (survivalRate >= 0.7) return "mixed";
  return "weak";
}

/**
 * Read the "when" answer out of the ladder rather than writing it down.
 *
 * The ages, and which of them clear the bar, are engine output; a regeneration
 * with a different book or a changed dataset has to move this prose with it.
 * `clearedEvery` is the first tested age where no history ran out at all —
 * stated separately from the 90% mark because "every one lasted" and "nine in
 * ten lasted" are different claims and the panel should not blur them.
 */
function readLadder<T extends { age: number; survivalRate: number }>(ladder: readonly T[]) {
  const ordered = [...ladder].sort((a, b) => a.age - b.age);
  return {
    ordered,
    earliestStrong: ordered.find((entry) => entry.survivalRate >= 0.9) ?? null,
    clearedEvery: ordered.find((entry) => entry.survivalRate >= 1) ?? null,
    earliest: ordered[0] ?? null,
  };
}

/** Spell small counts the way the panel's prose already does; fall back to digits. */
function countWord(n: number): string {
  if (n === 1) return "one";
  if (n === 2) return "two";
  return String(n);
}

/**
 * The unresolved/unsupported lists come from the generated engine output; do not
 * hardcode "two / two" here or a regeneration with a different book will lie.
 *
 * Both halves of "what they hold or where" matter: `unmappedHoldings` is the
 * engine's list of positions whose asset class *or* equity geography it could
 * not resolve, so a position it knows is stock but cannot place in a country is
 * excluded for the geography alone. Saying only "what they hold" would misstate
 * why the engine left it out.
 */
function unmodeledGapCopy(unresolvedCount: number, unsupportedCount: number): string | null {
  const parts: string[] = [];
  if (unresolvedCount > 0) {
    parts.push(
      unresolvedCount === 1
        ? "One does not say clearly enough what it holds or where"
        : `${countWord(unresolvedCount).replace(/^./, (c) => c.toUpperCase())} do not say clearly enough what they hold or where`
    );
  }
  if (unsupportedCount > 0) {
    parts.push(
      unsupportedCount === 1
        ? "one is a kind of investment with no century of history to test it against"
        : `${countWord(unsupportedCount)} are kinds of investment with no century of history to test them against`
    );
  }
  if (parts.length === 0) return null;
  return `${parts.join("; ")}.`;
}

/**
 * The "when can I retire?" sentence, written from the ladder rather than about
 * it. Every branch has to stay true of whatever the engine last produced —
 * including the unhappy one where no tested age clears nine in ten, which is a
 * real answer and not a case to hide.
 */
function ladderCopy(read: ReturnType<typeof readLadder>, sequencesTested: number): string {
  const parts = [
    `Same holdings, same spending, the same ${sequencesTested.toLocaleString("en-US")} stretches of ` +
      "market history — only the retirement date moves.",
  ];
  if (read.earliest) {
    parts.push(
      `At ${read.earliest.age} it lasted in ${percent(read.earliest.survivalRate * 100)} of them.`
    );
  }
  if (read.clearedEvery) {
    parts.push(
      `From ${read.clearedEvery.age} on, none of them ran out — which is a statement about ` +
        "overlapping stretches of one country's history, not a guarantee."
    );
  } else if (read.earliestStrong) {
    parts.push(
      `${read.earliestStrong.age} is the earliest age tested where at least nine in ten lasted.`
    );
  } else {
    parts.push("No age tested here reached nine in ten, which is itself the answer.");
  }
  return parts.join(" ");
}

/**
 * Anchor target for the jump link under the live result. Exported so the two
 * cannot drift: a link to an id nothing carries fails silently.
 */
export const CONNECTED_EXAMPLE_ID = "connect-accounts";

export function RetirementConnectedExample() {
  const { plan, portfolio, allocation, coverage, result } = EXAMPLE;
  const unmodeled = [...coverage.unresolved, ...coverage.unsupported];
  const gapCopy = unmodeledGapCopy(coverage.unresolved.length, coverage.unsupported.length);
  const [proxied] = result.proxiedSeries;
  const ladder = readLadder(EXAMPLE.byRetirementAge);
  const band = outcomeBand(result.survivalRate);

  return (
    <section className="qp-example" id={CONNECTED_EXAMPLE_ID}>
      {/*
        * The seam between the visitor's own result and this one. A rule would
        * just end the section above; this hands over to it. "Without the
        * guesswork" rather than "a real answer" on purpose — the six-number
        * result above is a real calculation, and the thing it lacks is
        * knowledge of the portfolio, not realness.
        */}
      <div className="qp-example-transition">
        <span>Now, without the guesswork</span>
      </div>

      <div className="shell">
        <div className="qp-example-head">
          <p className="section-kicker light">WHAT CHANGES WITH A REAL FINANCIAL MODEL</p>
          <h2>A more realistic answer, because the portfolio stops being a preset.</h2>
          <p className="qp-example-lede">
            Below is the same question modeled with actual holdings from connected, read-only accounts:{" "}
            {portfolio.holdingCount} real holdings across {portfolio.accountCount} accounts, worth{" "}
            {money(portfolio.totalInvestments)}. Same model, same century of history — nothing about
            the portfolio assumed.
          </p>
        </div>

        <div className="qp-example-answer" data-outcome={band}>
          <p className="qp-example-answer-verdict">
            Retiring at {plan.retirementAge} lasted in{" "}
            <strong>
              {result.sequencesSurvived.toLocaleString("en-US")} of the{" "}
              {result.sequencesTested.toLocaleString("en-US")}
            </strong>{" "}
            retirements in market history this portfolio could be tested against —{" "}
            {percent(result.survivalRate * 100)}.
          </p>

          <ol className="qp-example-ladder">
            {ladder.ordered.map((entry) => (
              <li
                key={entry.age}
                data-outcome={outcomeBand(entry.survivalRate)}
                data-primary={entry.age === plan.retirementAge ? "true" : undefined}
              >
                <span className="qp-ladder-age">
                  <span>Retire at {entry.age}</span>
                  {entry.age === plan.retirementAge ? (
                    <em className="qp-ladder-tag">this plan</em>
                  ) : null}
                </span>
                <span
                  className="qp-ladder-track"
                  role="img"
                  aria-label={`${percent(entry.survivalRate * 100)} of tested histories lasted`}
                >
                  <span
                    className="qp-ladder-fill"
                    style={{ width: `${entry.survivalRate * 100}%` }}
                  />
                </span>
                <b className="qp-ladder-rate">{percent(entry.survivalRate * 100)}</b>
                <small className="qp-ladder-count">
                  {entry.sequencesSurvived.toLocaleString("en-US")} of{" "}
                  {entry.sequencesTested.toLocaleString("en-US")} lasted
                </small>
              </li>
            ))}
          </ol>

          <p className="qp-example-answer-note">
            {ladderCopy(ladder, result.sequencesTested)} Which age you can name depends on what you
            actually hold, which is the rest of this panel.
          </p>
        </div>

        <div className="qp-example-grid">
          <article className="qp-example-card">
            <h3>It knows exactly what they own</h3>
            <dl className="qp-example-mix">
              <div><dt>Stocks</dt><dd>{percent(allocation.equity)}</dd></div>
              <div><dt>of which international</dt><dd>{percent(allocation.international)}</dd></div>
              <div><dt>Bonds</dt><dd>{percent(allocation.fixedIncome)}</dd></div>
              <div><dt>of which TIPS</dt><dd>{percent(allocation.tips)}</dd></div>
              <div><dt>Cash</dt><dd>{percent(allocation.cash)}</dd></div>
            </dl>
            <p>
              No ready-made mix would have guessed the inflation-protected bonds or how much of this
              money is invested overseas, and both change how the plan comes through a bad decade.
              These percentages are what the model could identify, not all of what it could run —
              the inflation-protected and corporate bonds counted on the bond line also appear in
              the list next door.
            </p>
          </article>

          <article className="qp-example-card qp-example-card-flag">
            <h3>It says what it cannot see</h3>
            <p className="qp-example-figure">{money(coverage.unmodeledValue)}</p>
            <p className="qp-example-figure-note">
              of {money(portfolio.totalInvestments)} — {percent((1 - coverage.valueCoverage) * 100, 1)} of the
              money — left out of the test rather than guessed at:
            </p>
            <ul className="qp-example-unmodeled">
              {unmodeled.map((label) => <li key={label}>{label}</li>)}
            </ul>
            <p>
              {gapCopy ? `${gapCopy} ` : null}
              The six-number answer above had nothing to admit here, because it made the whole
              portfolio up.
            </p>
          </article>

          <article className="qp-example-card">
            <h3>It shows how much to trust the answer</h3>
            <dl className="qp-example-mix">
              <div><dt>Money modeled</dt><dd>{percent(coverage.valueCoverage * 100)}</dd></div>
              <div><dt>Mapping confidence</dt><dd className="qp-example-low">{coverage.confidence}</dd></div>
              <div><dt>History tested</dt><dd>{result.sequencesTested} windows</dd></div>
            </dl>
            {proxied ? (
              <p>
                Real holdings bring their own gaps too. For {proxied.months} of the{" "}
                {proxied.windowMonths} months tested —{" "}
                {proxied.ranges
                  .map((range) => `${monthLabel(range.firstMonth)} to ${monthLabel(range.lastMonth)}`)
                  .join(", and ")}{" "}
                — nobody recorded what overseas markets did, so those months use the US market
                return instead. The plan is still checked against the whole record; those months
                just cannot tell you anything about holding money abroad.
              </p>
            ) : (
              <p>
                Every part of this portfolio has its own recorded returns for the whole tested
                window.
              </p>
            )}
          </article>
        </div>

        <div className="qp-example-result">
          <div>
            <span>Projected at {plan.retirementAge}</span>
            <strong>{money(result.projectedPortfolioAtRetirement)}</strong>
            <small>Median across tested histories, in today&apos;s dollars</small>
          </div>
          <div>
            <span>Tested against</span>
            <strong>{monthLabel(result.firstMonth)} onward</strong>
            <small>
              Same record as the result above, in {result.sequencesTested} overlapping windows, so
              the two are read against the same history
            </small>
          </div>
          <div>
            <span>How it reads the mix</span>
            <strong>{result.primaryObservation}</strong>
            <small>Stated at {result.confidence} confidence, for the reasons in this panel</small>
          </div>
        </div>

        <p className="qp-example-footnote">
          Example profile, not a customer. Every number above came out of the same model this page
          just ran on your six numbers — generated straight from it, never written by hand.
        </p>
      </div>
    </section>
  );
}
