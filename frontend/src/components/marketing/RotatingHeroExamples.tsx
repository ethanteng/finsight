"use client";

import { useEffect, useRef, useState } from "react";

const ROTATION_MS = 9000;

const HERO_EXAMPLES = [
  {
    id: "retirement",
    label: "RETIREMENT STRESS TEST",
    controlLabel: "Retirement",
    shortAnswer: "In this example, early market losses and rising spending are the main risks. See how the withdrawal rate and cash savings affect the plan.",
    question:
      "If inflation stays high and the market underperforms for the next 5 years, what impacts would that have on our retirement plan?",
    answer:
      "I’ve stress-tested 49 overlapping historical 37-year windows (which include several rough 5-year inflation/market stretches). They show a 100% survival rate at a 3.6% starting withdrawal rate. The real risk in a bad 5-year stretch is less about long-run survival and more about your heavily equity-weighted portfolio (82%) swinging hard with little cash cushion, plus inflation eating into your $150K spending target if it outpaces current expectations.",
  },
  {
    id: "home",
    label: "HOME PURCHASE",
    controlLabel: "Home",
    shortAnswer: "In this example, buying a $700K home would leave too little cash. A lower price, smaller down payment, or more savings would help.",
    question:
      "Can we afford a $700K home next year without pausing retirement contributions or leaving ourselves short on cash?",
    answer:
      "A 15% down payment is $105K. Add roughly $20K for closing and moving, and the upfront cost is about $125K—more than your current $82,651 in cash. To keep a $45K reserve and leave retirement contributions unchanged, you’d need about $87K more cash, a smaller down payment with higher monthly costs, or a lower purchase price.",
  },
  {
    id: "leave",
    label: "PARENTAL LEAVE",
    controlLabel: "Family leave",
    shortAnswer: "In this example, six months of leave costs about $22,500 in savings. Cash can cover it, with money left for an emergency fund.",
    question:
      "Can one of us take six months off when the baby arrives without selling investments?",
    answer:
      "Your current monthly income is $12,000 and spending is about $7,750, leaving a $4,250 cushion. If leave reduces take-home pay by $8,000 a month, the gap is about $3,750 a month, or $22,500 over six months. You can cover that from $82,651 in cash and still have about $60K left before delivery and childcare costs. Setting aside $15K for those costs would leave roughly $45K.",
  },
] as const;

export default function RotatingHeroExamples() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const activeExample = HERO_EXAMPLES[activeIndex];

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReduceMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.25),
      { threshold: [0.25] },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || isPaused || reduceMotion) return;
    const timer = window.setTimeout(
      () => setActiveIndex((current) => (current + 1) % HERO_EXAMPLES.length),
      ROTATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused, isVisible, reduceMotion]);

  return (
    <aside
      className="hero-audit-card rotating-hero-card"
      aria-label="Realistic Ask Linc answer examples"
      aria-roledescription="carousel"
      data-paused={isPaused ? "true" : undefined}
      ref={cardRef}
      onPointerDown={() => setIsPaused(true)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) setIsPaused(false);
      }}
    >
      <span className="hero-example-header">
        <b>ASK LINC · {activeExample.label}</b>
        <em>{String(activeIndex + 1).padStart(2, "0")} OF {String(HERO_EXAMPLES.length).padStart(2, "0")}</em>
      </span>
      <div className="hero-example-question" key={`${activeExample.id}-question`}>
        <i>01</i>
        <p><small>YOUR QUESTION</small><strong>{activeExample.question}</strong></p>
      </div>
      <div className="active hero-example-answer" key={`${activeExample.id}-answer`}>
        <i>02</i>
        <div><small>EXAMPLE ANSWER</small><p>{activeExample.shortAnswer}</p>
          <details className="answer-details" key={activeExample.id}>
            <summary>See the numbers</summary>
            <p>{activeExample.answer}</p>
          </details>
        </div>
      </div>
      <nav className="hero-example-controls" aria-label="Choose a sample answer">
        {HERO_EXAMPLES.map((example, index) => (
          <button
            type="button"
            aria-current={index === activeIndex ? "true" : undefined}
            aria-label={`Show ${example.controlLabel} example`}
            key={example.id}
            onClick={() => {
              setIsPaused(true);
              setActiveIndex(index);
            }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {example.controlLabel}
          </button>
        ))}
      </nav>
      <footer>Your numbers · Assumptions · Math · Checks · Sources</footer>
    </aside>
  );
}
