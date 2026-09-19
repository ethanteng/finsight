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
        <div className="example-insight"><strong>{later ? "Same travel budget. More breathing room." : "The pressure point: 12 years before Social Security."}</strong><p>{later ? "Two more years of work and saving lower the initial draw from 4.9% to 4.3%, while keeping the full $84,000 annual budget." : "Your portfolio covers the full $84,000/year until age 67. Then $36,000 of Social Security reduces that need to $48,000/year."}</p></div>
      </div>
      <p className="scene-caption">Illustrative household. Actual calculator output.<br />Past results are not a forecast.</p>
    </div>
  );
}
