import { RETIREMENT_STORY_EXAMPLE as example } from "@/data/retirement-story-example";

export function RetirementExampleNotes() {
  return (
    <details className="retirement-example-notes">
      <summary>Example inputs &amp; method</summary>
      <dl>
        <div><dt>Starting point</dt><dd>Age 52 · $1.4M invested</dd></div>
        <div><dt>Saving until retirement</dt><dd>$36,000/year</dd></div>
        <div><dt>Retirement spending</dt><dd>$72,000 living costs + $12,000 travel per year</dd></div>
        <div><dt>Social Security</dt><dd>$36,000/year from age 67</dd></div>
        <div><dt>Investment mix</dt><dd>60% US stocks · 35% bonds · 5% cash</dd></div>
      </dl>
      <p>Calculated with Ask Linc’s retirement engine using {example.history.sequencesTested} overlapping {example.history.horizonYears}-year market histories, July 1926–June 2026. Spending and contributions rise with historical inflation. Plans are tested through age 95.</p>
      <p>The initial draw is $84,000 divided by the median portfolio at retirement. Taxes, fees, and separate healthcare costs are not modeled. Historical windows overlap; these percentages are not independent trials or odds of future success.</p>
    </details>
  );
}
