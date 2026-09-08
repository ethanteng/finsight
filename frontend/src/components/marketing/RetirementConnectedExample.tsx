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
 * The panel deliberately leads with what the model could *not* do — the
 * $464,272 it declined to simulate, the 79.6% coverage, its own low confidence
 * rating. A richer answer that hid its gaps would be a worse advertisement for
 * this particular product than one that prints them.
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

export function RetirementConnectedExample() {
  const { plan, portfolio, allocation, coverage, result } = EXAMPLE;
  const unmodeled = [...coverage.unresolved, ...coverage.unsupported];
  const gapCopy = unmodeledGapCopy(coverage.unresolved.length, coverage.unsupported.length);

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
            <p>
              Real holdings can also narrow what is testable: the international funds only have
              returns from {monthLabel(result.firstMonth)}, so this plan was checked against{" "}
              {result.sequencesTested} windows starting after that, not the century the presets
              above get. That is a cost of the richer answer, not a bonus.
            </p>
          </article>
        </div>

        <div className="qp-example-result">
          <div>
            <span>Projected at {plan.retirementAge}</span>
            <strong>{money(result.projectedPortfolioAtRetirement)}</strong>
            <small>Median across tested histories, in today&apos;s dollars</small>
          </div>
          <div>
            <span>Sequences survived</span>
            <strong>{result.sequencesSurvived} of {result.sequencesTested}</strong>
            <small>
              Not comparable to the figure above: a different, shorter and kinder stretch of history
            </small>
          </div>
          <div>
            <span>Engine&apos;s own read</span>
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
