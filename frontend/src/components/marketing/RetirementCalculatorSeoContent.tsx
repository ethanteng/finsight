import Link from "next/link";
import { RETIREMENT_CALCULATOR_FAQ } from "@/lib/retirement-calculator-content";

/**
 * The always-present body of /retirement-calculator.
 *
 * Rendered on the server and passed into the client calculator, so it costs
 * nothing in the client bundle and is in the HTML whether or not anyone runs
 * the model. It carries the page's explanatory copy, the FAQ that the page's
 * FAQPage structured data is generated from, and the links out to the rest of
 * the retirement cluster.
 */
export function RetirementCalculatorSeoContent() {
  return (
    <>
      <section className="shell qp-explainer">
        <p className="section-kicker">HOW THIS RETIREMENT CALCULATOR WORKS</p>
        <h2>Real history, not an average return.</h2>
        <p className="qp-explainer-lede">
          Most retirement calculators grow your savings at one assumed rate and show you a smooth
          curve. Markets have never delivered one. This one replays what actually happened —
          month by month, from 1926 onward — and reports how your plan would have fared in each
          of those retirements.
        </p>
        <ol className="qp-explainer-steps">
          <li>
            <b>01</b>
            <div>
              <strong>Enter six numbers</strong>
              <p>
                Your age, the age you want to retire, what you have invested, what you expect to
                spend each year, what you still add each year, and your Social Security estimate.
              </p>
            </div>
          </li>
          <li>
            <b>02</b>
            <div>
              <strong>Pick the closest asset mix</strong>
              <p>
                Conservative, balanced or growth. Sequence risk depends on what you hold, and a
                preset is an assumption — the page names it as one in every result.
              </p>
            </div>
          </li>
          <li>
            <b>03</b>
            <div>
              <strong>Read what history did to that plan</strong>
              <p>
                The share of overlapping historical retirements the portfolio outlasted, the
                spending the record was willing to fund, and the two levers that change the
                answer most.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="shell qp-tests">
        <h2>What the model actually tests</h2>
        <ul className="qp-tests-list">
          <li>
            <strong>Sequence-of-returns risk</strong>
            <p>
              Every overlapping window the record can cover, including the 1929, 1966 and 1973
              starts that define what a bad retirement looks like.
            </p>
          </li>
          <li>
            <strong>Real inflation</strong>
            <p>
              Withdrawals rise with the actual CPI of each tested period, not a flat assumption,
              and spending is held constant in real terms.
            </p>
          </li>
          <li>
            <strong>Contributions before you retire</strong>
            <p>
              The years between now and your retirement date are simulated too, not compounded at
              an average rate.
            </p>
          </li>
          <li>
            <strong>Social Security as indexed income</strong>
            <p>
              Your benefit begins at the claiming age you choose and offsets withdrawals from
              then on, with the gap years funded by the portfolio.
            </p>
          </li>
        </ul>
        <p className="qp-tests-note">
          Market history comes from the Kenneth R. French Data Library (US equity, Treasury bills)
          and Robert J. Shiller (long-term government bonds, CPI). It is an informational model,
          not financial advice. See <Link href="/trust">how we show the math</Link>.
        </p>
      </section>

      <section className="shell qp-faq">
        <h2>Retirement calculator questions</h2>
        <div className="qp-faq-list">
          {RETIREMENT_CALCULATOR_FAQ.map((item) => (
            <details key={item.question}>
              <summary>
                <h3>{item.question}</h3>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="shell qp-related">
        <h2>Keep going</h2>
        <ul className="qp-related-list">
          <li>
            <Link href="/retirement-answers">
              <strong>Retirement guides</strong>
              <span>The first-year math behind the questions people actually search for.</span>
            </Link>
          </li>
          <li>
            <Link href="/can-i-retire-at-55">
              <strong>Can I retire at 55?</strong>
              <span>What retiring a decade early changes about the plan.</span>
            </Link>
          </li>
          <li>
            <Link href="/can-i-retire-with-1-million">
              <strong>Can I retire with $1 million?</strong>
              <span>What a $1M portfolio supports, and what breaks it.</span>
            </Link>
          </li>
          <li>
            <Link href="/retirement-readiness">
              <strong>Retirement readiness</strong>
              <span>The checks worth running before you set a date.</span>
            </Link>
          </li>
          <li>
            <Link href="/use-cases/retirement">
              <strong>How Ask Linc plans retirement</strong>
              <span>The same engine, run against your real accounts.</span>
            </Link>
          </li>
        </ul>
      </section>
    </>
  );
}
