"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, LockKeyhole, Pause, Play, RotateCcw } from "lucide-react";
import { RETIREMENT_STORY_EXAMPLE as example, storyPercent, storyPortfolio } from "@/data/retirement-story-example";
import { RetirementExampleNotes } from "./RetirementExampleNotes";

const [earlier, later] = example.scenarios;

const institutions = [
  "Chase", "Fidelity", "Schwab",
  "Bank of America", "Capital One", "American Express",
  "Wells Fargo", "Citi", "Robinhood",
];

/** Play once on entry; keep the complete story available without motion or JS. */
function useScenePlayback(lastStep: number, interval: number, firstStep = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(lastStep);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      setReducedMotion(media.matches);
      if (media.matches) {
        setPlaying(false);
        setStep(lastStep);
      }
    };
    syncMotion();
    media.addEventListener("change", syncMotion);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (!media.matches) {
        setStep(firstStep);
        setPlaying(true);
      }
      observer.disconnect();
    }, { threshold: 0.35 });
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", syncMotion);
    };
  }, [firstStep, lastStep]);

  useEffect(() => {
    if (!playing || step >= lastStep) return;
    const timer = window.setTimeout(() => setStep((value) => value + 1), interval);
    return () => window.clearTimeout(timer);
  }, [interval, lastStep, playing, step]);

  const isPlaying = playing && step < lastStep;
  const controlLabel = isPlaying ? "Pause" : step < lastStep ? "Play" : "Replay";
  const ControlIcon = isPlaying ? Pause : step < lastStep ? Play : RotateCcw;
  function toggle() {
    if (isPlaying) setPlaying(false);
    else {
      if (step >= lastStep) setStep(firstStep);
      setPlaying(true);
    }
  }

  return { ref, step, reducedMotion, controlLabel, ControlIcon, toggle };
}

export function ConnectedLifeVisual() {
  const scene = useScenePlayback(institutions.length, 460);

  return (
    <div className="connected-life-visual institution-scene" ref={scene.ref}>
      <div className="scene-heading">
        <span className="story-visual-label">YOUR ACCOUNTS</span>
        <span className="scene-counter">{scene.step} / {institutions.length} connected</span>
        {!scene.reducedMotion && <button type="button" className="scene-control" onClick={scene.toggle} aria-label={`${scene.controlLabel} connection animation`}><scene.ControlIcon size={14} aria-hidden="true" /></button>}
      </div>
      <ul className="institution-grid" aria-label="Illustrative financial account connections">
        {institutions.map((name, index) => {
          const connected = index < scene.step;
          const connecting = index === scene.step;
          return (
            <li key={name} className={connected ? "institution-tile is-connected" : "institution-tile"}>
              <span className="institution-indicator" aria-hidden="true">{connected ? <Check size={12} /> : <span />}</span>
              <strong>{name}</strong>
              <span className="institution-status">{connected ? "Connected" : connecting ? "Connecting…" : "Ready"}</span>
            </li>
          );
        })}
      </ul>
      <div className="connection-summary"><LockKeyhole size={15} aria-hidden="true" /><span>Read-only. Your money stays where it is.</span></div>
      <p className="scene-caption">Example connections. Availability varies by institution.</p>
    </div>
  );
}

export function AnalysisVisual() {
  const scene = useScenePlayback(5, 1450, 1);

  return (
    <div className="analysis-visual conversation-scene" ref={scene.ref}>
      <div className="scene-heading">
        <span className="brand-mark" aria-hidden="true">L</span>
        <span className="story-visual-label">A CONVERSATION WITH LINC</span>
        {!scene.reducedMotion && <button type="button" className="scene-control" onClick={scene.toggle} aria-label={`${scene.controlLabel} conversation animation`}><scene.ControlIcon size={14} aria-hidden="true" /></button>}
      </div>
      <ol className="story-conversation" aria-label="Example conversation with Ask Linc">
        <li className={`chat-turn from-you ${scene.step >= 1 ? "is-visible" : ""}`}><span className="chat-speaker">YOU</span><p>Could we retire at 55 and keep traveling?</p></li>
        <li className={`chat-turn from-linc ${scene.step >= 2 ? "is-visible" : ""}`}><span className="chat-speaker">LINC</span><p>You have $1.4M invested and spend about $6,000/month. Keep saving $36,000/year until retirement?</p></li>
        <li className={`chat-turn from-you ${scene.step >= 3 ? "is-visible" : ""}`}><span className="chat-speaker">YOU</span><p>Yes. Add $12,000/year for travel—and compare retiring at 57.</p></li>
        <li className={`chat-turn from-linc chat-final ${scene.step >= 4 ? "is-visible" : ""}`}>
          <span className="chat-speaker">LINC</span>
          <div className="chat-answer-space">
            <div className="chat-working" aria-hidden={scene.step !== 4} hidden={scene.step !== 4}><span className="chat-typing" aria-hidden="true"><i /><i /><i /></span>Comparing retirement dates…</div>
            <div className={scene.step >= 5 ? "chat-finished is-visible" : "chat-finished"}>
              <p>At 55, {earlier.sequencesTested - earlier.sequencesSurvived} of {earlier.sequencesTested} historical plans ran out before age 95. At 57, {later.sequencesSurvived === later.sequencesTested ? "none" : later.sequencesTested - later.sequencesSurvived} did—with the same $84,000/year budget. The vulnerable stretch is before Social Security starts at 67.</p>
              <div className="chat-plan-comparison"><span>MEDIAN PORTFOLIO AT RETIREMENT</span><div>{example.scenarios.map((result) => <div key={result.retirementAge}><small>Retire at {result.retirementAge}</small><strong>{storyPortfolio(result.projectedPortfolioAtRetirement)}</strong><span>{storyPercent(result.firstYearWithdrawalRate)} initial draw</span></div>)}</div><Link href="/retirement-calculator" className="chat-plan-link" tabIndex={scene.step >= 5 ? undefined : -1}>Try your own numbers <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
            </div>
          </div>
        </li>
      </ol>
      <p className="scene-caption">Illustrative household. Actual calculator output.<br />Past results are not a forecast.</p>
      <RetirementExampleNotes />
    </div>
  );
}
