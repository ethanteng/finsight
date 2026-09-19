import Link from "next/link";
import { RETIREMENT_STORY_EXAMPLE as example, storyPercent } from "@/data/retirement-story-example";
import { RetirementExampleNotes } from "./RetirementExampleNotes";

/** A worked example, using the same calculator output as the homepage story. */
export function ShowTheMathPreview() {
  const result = example.scenarios[0];
  const dollars = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <article className="math-preview" aria-label="Show the Math worked example">
      <header><span className="brand-mark small" aria-hidden="true">L</span><strong>SHOW THE MATH</strong><small>EXAMPLE</small></header>
      <div className="math-preview-answer">
        <span>LINC’S ANSWER</span>
        <h2>Your first-year withdrawal is {storyPercent(result.firstYearWithdrawalRate)} of your portfolio.</h2>
        <p>Retiring at {result.retirementAge}, with {dollars(result.annualSpending)} a year to spend.</p>
      </div>
      <dl className="math-preview-evidence">
        <div><dt>Your inputs</dt><dd>Age {example.inputs.currentAge} · {dollars(example.inputs.investableAssets)} invested · {dollars(example.inputs.annualContributions)}/year saved until retirement.</dd></div>
        <div><dt>Assumptions</dt><dd>Retire at {result.retirementAge}. Social Security starts at {example.inputs.socialSecurityStartAge}. Plan through age {example.inputs.lifeExpectancy}.</dd></div>
        <div className="math-preview-formula"><dt>The calculation</dt><dd><strong>{dollars(result.firstYearPortfolioWithdrawal)} ÷ {dollars(result.projectedPortfolioAtRetirement)} <span>= {storyPercent(result.firstYearWithdrawalRate)}</span></strong><small>Annual draw ÷ median portfolio at retirement</small></dd></div>
        <div><dt>Check the result</dt><dd>{result.sequencesSurvived} of {result.sequencesTested} historical plans lasted to age {example.inputs.lifeExpectancy}. {result.sequencesTested - result.sequencesSurvived} ran short.</dd></div>
        <div><dt>Sources</dt><dd>Fictional household inputs. US market returns and inflation, July 1926–June 2026.</dd></div>
      </dl>
      <div className="math-preview-footnote"><p>Real calculator output for an illustrative household. Historical outcomes are not future probabilities.</p><RetirementExampleNotes /></div>
      <Link className="math-preview-link" href="/trust">Explore Show the Math <span aria-hidden="true">→</span></Link>
    </article>
  );
}
