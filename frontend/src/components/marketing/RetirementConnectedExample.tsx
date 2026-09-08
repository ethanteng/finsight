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
 * "asset class or equity geography" is the engine's own wording for
 * `unmappedHoldings`, and both halves matter: a declared-equity position with
 * no resolvable country is dropped for the geography alone. Saying only
 * "asset class" misstates why the engine excluded it.
 */
function unmodeledGapCopy(unresolvedCount: number, unsupportedCount: number): string | null {
  const parts: string[] = [];
  if (unresolvedCount > 0) {
    parts.push(
      unresolvedCount === 1
        ? "One has no resolvable asset class or equity geography"
        : `${countWord(unresolvedCount).replace(/^./, (c) => c.toUpperCase())} have no resolvable asset class or equity geography`
    );
  }
  if (unsupportedCount > 0) {
    parts.push(
      unsupportedCount === 1
        ? "one has a class the engine has no return series for"
        : `${countWord(unsupportedCount)} have one the engine has no return series for`
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

export function RetirementConnectedExample() {
  const { plan, portfolio, allocation, coverage, result } = EXAMPLE;
  const unmodeled = [...coverage.unresolved, ...coverage.unsupported];
  const gapCopy = unmodeledGapCopy(coverage.unresolved.length, coverage.unsupported.length);
  const [proxied] = result.proxiedSeries;
  const ladder = readLadder(EXAMPLE.byRetirementAge);
  const band = outcomeBand(result.survivalRate);

  return (
    <section className="qp-example">
      <div className="shell">
        <div className="qp-example-head">
          <p className="section-kicker">THE SAME QUESTION, WITH THE ACCOUNTS CONNECTED</p>
          <h2>What the model says when it doesn&apos;t have to guess</h2>
          <p className="qp-example-lede">
            An example profile, run through the same engine. The plan is the same shape the form
            above asks for — retiring at {plan.retirementAge}, spending{" "}
            {money(plan.annualSpending)} a year, {money(plan.annualContributions)} a year saved until
            then, {money(plan.socialSecurityAnnual)} of Social Security from{" "}
            {plan.socialSecurityStartAge}. What changed is that the model read{" "}
            {portfolio.holdingCount} holdings across {portfolio.accountCount} accounts worth{" "}
            {money(portfolio.totalInvestments)}, instead of assuming a preset.
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
            <h3>It found the actual mix</h3>
            <dl className="qp-example-mix">
              <div><dt>Stocks</dt><dd>{percent(allocation.equity)}</dd></div>
              <div><dt>of which international</dt><dd>{percent(allocation.international)}</dd></div>
              <div><dt>Bonds</dt><dd>{percent(allocation.fixedIncome)}</dd></div>
              <div><dt>of which TIPS</dt><dd>{percent(allocation.tips)}</dd></div>
              <div><dt>Cash</dt><dd>{percent(allocation.cash)}</dd></div>
            </dl>
            <p>
              No preset would have guessed the inflation-protected sleeve or the international
              weight, and both change how this plan behaves in a bad decade. These are what the
              mapper classified, not what it simulated — the TIPS and corporate-bond sleeves sit
              inside the bond line and also in the list next door.
            </p>
          </article>

          <article className="qp-example-card qp-example-card-flag">
            <h3>And told you what it still couldn&apos;t model</h3>
            <p className="qp-example-figure">{money(coverage.unmodeledValue)}</p>
            <p className="qp-example-figure-note">
              of {money(portfolio.totalInvestments)} — {percent((1 - coverage.valueCoverage) * 100, 1)} of the
              money — left out of the simulation rather than guessed at:
            </p>
            <ul className="qp-example-unmodeled">
              {unmodeled.map((label) => <li key={label}>{label}</li>)}
            </ul>
            <p>
              {gapCopy ? `${gapCopy} ` : null}
              The six-number version above had nothing to disclose here, because it invented the
              whole portfolio.
            </p>
          </article>

          <article className="qp-example-card">
            <h3>Then said how much to trust it</h3>
            <dl className="qp-example-mix">
              <div><dt>Money modeled</dt><dd>{percent(coverage.valueCoverage * 100)}</dd></div>
              <div><dt>Mapping confidence</dt><dd className="qp-example-low">{coverage.confidence}</dd></div>
              <div><dt>History tested</dt><dd>{result.sequencesTested} windows</dd></div>
            </dl>
            {proxied ? (
              <p>
                Real holdings also bring their own gaps. For {proxied.months} of the{" "}
                {proxied.windowMonths} months tested —{" "}
                {proxied.ranges
                  .map((range) => `${monthLabel(range.firstMonth)} to ${monthLabel(range.lastMonth)}`)
                  .join(", and ")}{" "}
                — the international series has no returns of its own, so that sleeve carries the US
                market return rather than its own. The plan is still checked against the whole
                record; those months simply hold no distinct international behaviour.
              </p>
            ) : (
              <p>
                Every sleeve in this portfolio has its own returns for the whole tested window.
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
          Example profile, not a customer. Every number above is output from the same
          <code> analyzeRetirementPortfolio </code>
          this page runs on your six numbers — regenerated from the engine, never written by hand.
        </p>
      </div>
    </section>
  );
}
