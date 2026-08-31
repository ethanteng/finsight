"use client";

import { useEffect, useRef, useState } from "react";
import StaticProductDemo, { DEMO_DECISIONS } from "./StaticProductDemo";

type ComparisonView = "general" | "linc";

const autoAdvanceDelay = 5200;
const autoClickLead = 260;
const autoClickDuration = 720;

const genericAdvice: Record<string, { summary: string; steps: string[] }> = {
  retirement: {
    summary:
      "Retirement planning usually starts with your expected spending, savings, other income, and the number of years your money may need to last.",
    steps: [
      "Estimate annual retirement spending.",
      "Add up savings, investments, pensions, and Social Security.",
      "Plan for health care, taxes, and inflation.",
      "Test whether your savings could last through retirement.",
    ],
  },
  inflation: {
    summary:
      "High inflation can raise future spending while weak markets reduce portfolio growth, especially early in retirement.",
    steps: [
      "Test higher spending and lower investment returns.",
      "Review how much of the portfolio is in stocks.",
      "Keep enough cash to avoid selling after a market drop.",
      "Revisit the plan as inflation and markets change.",
    ],
  },
  "credit-cards": {
    summary:
      "To understand credit-card debt, list every balance, interest rate, minimum payment, and due date.",
    steps: [
      "Keep every minimum payment current.",
      "Usually pay the highest-rate balance first.",
      "Avoid adding new charges while paying balances down.",
      "Compare a lower-rate option if repayment will take time.",
    ],
  },
};

function GeneralChatMockup() {
  const [decisionId, setDecisionId] = useState(DEMO_DECISIONS[0].id);
  const decision = DEMO_DECISIONS.find((item) => item.id === decisionId) ?? DEMO_DECISIONS[0];
  const advice = genericAdvice[decision.id];

  return (
    <figure className="general-chat-mockup" aria-label="General-purpose AI answers without connected accounts">
      <div className="general-chat-browser-bar">
        <div aria-hidden="true"><span /><span /><span /></div>
        <p>General-purpose AI chat</p>
        <strong>NO ACCOUNTS CONNECTED</strong>
      </div>
      <div className="general-chat-shell">
        <nav className="general-chat-questions" aria-label="General AI example questions">
          <div><span>Same questions</span><b>{DEMO_DECISIONS.length}</b></div>
          {DEMO_DECISIONS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === decision.id ? "active" : ""}
              aria-current={item.id === decision.id ? "true" : undefined}
              onClick={() => setDecisionId(item.id)}
            >
              <strong>{item.shortTitle}</strong>
              <small>{item.date}</small>
            </button>
          ))}
        </nav>
        <div className="general-chat-conversation">
          <div className="general-chat-question">
            <span>YOU</span>
            <p>{decision.question}</p>
          </div>
          <article className="general-chat-response" aria-live="polite">
            <div className="general-chat-response-heading"><i aria-hidden="true">✦</i><span>GENERAL GUIDANCE</span></div>
            <p>{advice.summary}</p>
            <ol>
              {advice.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <aside>
              <span>WHAT I CAN’T CHECK</span>
              <p>I can’t see your accounts, balances, rates, or goals, so this is a general checklist—not a personal answer.</p>
            </aside>
          </article>
        </div>
      </div>
      <figcaption>Illustrative general-purpose AI response. No financial accounts connected.</figcaption>
    </figure>
  );
}

export default function AnswerProofComparison() {
  const [view, setView] = useState<ComparisonView>("general");
  const [autoPlay, setAutoPlay] = useState(true);
  const [autoClickView, setAutoClickView] = useState<ComparisonView | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const comparisonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      setReduceMotion(mediaQuery.matches);
      if (mediaQuery.matches) setView("linc");
    };
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const comparison = comparisonRef.current;
    if (!comparison) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0.35] },
    );
    observer.observe(comparison);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoPlay || !isVisible || reduceMotion || view !== "general" || autoClickView) return;
    const timer = window.setTimeout(() => setAutoClickView("linc"), autoAdvanceDelay);
    return () => window.clearTimeout(timer);
  }, [autoClickView, autoPlay, isVisible, reduceMotion, view]);

  useEffect(() => {
    if (!autoClickView) return;
    const selectTimer = window.setTimeout(() => setView(autoClickView), autoClickLead);
    const clearTimer = window.setTimeout(() => setAutoClickView(null), autoClickDuration);
    return () => {
      window.clearTimeout(selectTimer);
      window.clearTimeout(clearTimer);
    };
  }, [autoClickView]);

  function stopAutoPlay() {
    setAutoPlay(false);
    setAutoClickView(null);
  }

  function chooseView(nextView: ComparisonView) {
    stopAutoPlay();
    setView(nextView);
  }

  return (
    <div
      className="answer-proof-grid"
      id="product-demo"
      ref={comparisonRef}
      aria-label="Compare a general chatbot answer with Ask Linc"
      onFocusCapture={stopAutoPlay}
      onPointerDownCapture={stopAutoPlay}
      onKeyDownCapture={stopAutoPlay}
    >
      <div className="answer-proof-contrast" role="tablist" aria-label="Choose an answer type">
        <button type="button" role="tab" id="answer-proof-general-tab" aria-controls="answer-proof-panel" aria-selected={view === "general"} onClick={() => chooseView("general")}>
          <span>A GENERAL CHATBOT</span>
          <h3>No accounts. General guidance.</h3>
        </button>
        <button
          type="button"
          role="tab"
          id="answer-proof-linc-tab"
          aria-controls="answer-proof-panel"
          aria-selected={view === "linc"}
          data-auto-click={autoClickView === "linc" ? "true" : undefined}
          onClick={() => chooseView("linc")}
        >
          <span>ASK LINC</span>
          <h3>All your accounts. Answers you can check.</h3>
        </button>
      </div>
      <div className="answer-proof-stage" role="tabpanel" id="answer-proof-panel" aria-labelledby={view === "general" ? "answer-proof-general-tab" : "answer-proof-linc-tab"}>
        <div className="answer-proof-panel" key={view}>
          {view === "general" ? <GeneralChatMockup /> : <StaticProductDemo anchorId={null} />}
        </div>
      </div>
    </div>
  );
}
