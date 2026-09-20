"use client";

import { useState } from "react";
import { RETIREMENT_STORY_EXAMPLE as example, storyPercent, storyPortfolio } from "@/data/retirement-story-example";

/** Precomputed output from the real calculator, for one fictional household. */
export function AssumptionPreview() {
  const [retirementAge, setRetirementAge] = useState(55);
  const result = example.scenarios.find((scenario) => scenario.retirementAge === retirementAge)!;
  const later = retirementAge === 57;
  const failures = result.sequencesTested - result.sequencesSurvived;

  return (
    <div className="assumption-preview">
      <div className="story-visual-label">SAME $84,000/YEAR. A DIFFERENT RETIREMENT DATE.</div>
      <div className="assumption-control"><span id="retirement-age-label">Retire at</span><div role="group" aria-labelledby="retirement-age-label">{example.scenarios.map(({ retirementAge: age }) => <button type="button" key={age} aria-pressed={retirementAge === age} onClick={() => setRetirementAge(age)}>Age {age}</button>)}</div></div>
      <div className="assumption-result" aria-live="polite" aria-atomic="true">
        <div className="example-survival"><strong>{storyPercent(result.survivalRate)}</strong><span>of historical plans<br />lasted to age 95</span></div>
        <div className="example-survival-bar" aria-hidden="true"><span style={{ width: storyPercent(result.survivalRate) }} /></div>
        <p className="example-survival-count">{result.sequencesSurvived} of {result.sequencesTested} tested histories. {failures > 0 ? `${failures} ran out before age 95.` : "None ran out in the tested history."}</p>
        <div className="assumption-outcomes"><div><strong>{storyPortfolio(result.projectedPortfolioAtRetirement)}</strong><span>median portfolio at retirement</span></div><div><strong>{storyPercent(result.firstYearWithdrawalRate)}</strong><span>initial portfolio withdrawal</span></div></div>
        <div className="example-insight"><strong>{later ? "Two more working years keep the travel budget." : "55 can work if the travel budget is flexible."}</strong><p>{later ? "At 57, the $84,000 plan lasted in all 685 tests. You keep the $12,000 travel budget, with about $252,000 more invested in the median projection." : "At 55, removing the extra $12,000 for travel brought the histories that ran short from 65 to zero. That assumes $72,000 spending throughout retirement, not just a temporary cut."}</p></div>
      </div>
      <p className="scene-caption">Illustrative household. Actual calculator output.<br />Past results are not a forecast.</p>
    </div>
  );
}
