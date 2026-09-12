import Link from "next/link";
import { RETIREMENT_CALCULATOR_FAQ } from "@/lib/retirement-calculator-content";

/**
 * The always-present body of /retirement-calculator.
 *
 * Rendered on the server and passed into the client calculator, so it costs
 * nothing in the client bundle and is in the HTML whether or not anyone runs
 * the model. It carries the FAQ that the page's FAQPage structured data is
 * generated from, and the links out to the rest of the retirement cluster.
 *
 * It used to open with two explanatory blocks — a numbered "how this
 * calculator works" walkthrough and a "what the model actually tests" list.
 * Both were removed in favour of letting the model's own output do that work:
 * the result names the window it tested, the assumptions disclosure lists every
 * assumption, and the connected-accounts panel shows what the model does with a
 * real portfolio. Note that the always-present sourcing line and the /trust
 * link left with them; the same sourcing is still in the assumptions
 * disclosure, which a visitor only sees after running the model.
 */
export function RetirementCalculatorSeoContent() {
  return (
    <>
      <section className="shell qp-faq">
        <h2>Retirement FAQs</h2>
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
        <h2>Read more about retirement</h2>
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
            <Link href="/coast-fire-calculator">
              <strong>Coast FIRE calculator</strong>
              <span>Find your Coast FIRE number, inspect the assumptions, and ask whether you can really coast.</span>
            </Link>
          </li>
          <li>
            <Link href="/use-cases/retirement">
              <strong>How Ask Linc plans retirement</strong>
              <span>Keep retirement age, spending, Social Security, portfolio risk, and scenarios in one model.</span>
            </Link>
          </li>
        </ul>
      </section>
    </>
  );
}
