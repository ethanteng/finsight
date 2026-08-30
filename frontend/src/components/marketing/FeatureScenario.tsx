"use client";

import { useState } from "react";

const outcomes = {
  58: {
    headline: "Possible—with less room if markets stay down.",
    surplus: "+$640K projected cushion",
    range: "68–76%",
    note: "The plan works, but a market drop in the first five years would hurt more.",
  },
  60: {
    headline: "Yes—with room to spare.",
    surplus: "+$1.7M projected cushion",
    range: "75–85%",
    note: "This gives you the strongest balance of time, lifestyle, and cushion.",
  },
  62: {
    headline: "Yes—with more cushion than the plan appears to need.",
    surplus: "+$2.8M projected cushion",
    range: "86–92%",
    note: "Waiting adds more cushion, but may trade away time you value more.",
  },
} as const;

type RetirementAge = keyof typeof outcomes;

export function FeatureScenario() {
  const [age, setAge] = useState<RetirementAge>(60);
  const outcome = outcomes[age];

  return (
    <article className="feature-scenario-lead">
      <div className="feature-scenario-copy">
        <span className="card-index">01 / EXPLORE</span>
        <h2>Change the assumption, not the spreadsheet.</h2>
        <p>Move the retirement date and watch the answer change. Linc keeps the rest of your money in view while you compare the tradeoff.</p>
      </div>
      <div className="feature-scenario-panel">
        <div className="scenario-pills" role="group" aria-label="Choose a retirement age">
          {([58, 60, 62] as const).map((option) => (
            <button
              type="button"
              key={option}
              className={option === age ? "active" : ""}
              aria-pressed={option === age}
              onClick={() => setAge(option)}
            >
              Retire at {option}
            </button>
          ))}
        </div>
        <div className="feature-outcome" aria-live="polite">
          <span>LINC&apos;S ANSWER · RETIRE AT {age}</span>
          <strong>{outcome.headline}</strong>
          <div><b>{outcome.surplus}</b><span>Success range <i>{outcome.range}</i></span></div>
          <p>{outcome.note}</p>
        </div>
      </div>
    </article>
  );
}
