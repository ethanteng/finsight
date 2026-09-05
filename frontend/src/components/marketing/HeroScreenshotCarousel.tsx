"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const ROTATION_MS = 7000;

const HERO_SHOTS = [
  {
    id: "answer",
    label: "THE ANSWER",
    controlLabel: "Answer",
    caption: "A direct answer with the key metrics it rests on, computed from your connected accounts.",
    src: "/images/product/decision-answer.png",
    width: 1370,
    height: 1662,
    alt: "Ask Linc answering a retirement planning question, with key metrics for net worth, total debt, savings rate, and total investments alongside a connected-account overview.",
  },
  {
    id: "math",
    label: "SHOW THE MATH",
    controlLabel: "Math",
    caption: "Every figure traced back to its source, calculation, and validation check.",
    src: "/images/product/show-the-math.png",
    width: 1248,
    height: 1580,
    alt: "The Math tab of an Ask Linc answer, showing canonical facts and provenance, context planning, deterministic validation, and the snapshot behind the answer.",
  },
  {
    id: "net-worth",
    label: "YOUR FINANCIAL PICTURE",
    controlLabel: "Net worth",
    caption: "Cash, investments, property, and debt tracked together over time.",
    src: "/images/product/net-worth-history.png",
    width: 1206,
    height: 1508,
    alt: "An Ask Linc net worth summary with a Financial Metrics Over Time chart plotting net worth, cash, investments, and home value.",
  },
  {
    id: "portfolio",
    label: "INVESTMENT PORTFOLIO",
    controlLabel: "Portfolio",
    caption: "Holdings and allocation across every connected investment account.",
    src: "/images/product/portfolio-overview.png",
    width: 1638,
    height: 1582,
    alt: "An Ask Linc investment portfolio overview with total portfolio value, holdings count, and asset allocation broken down by ETF, target date fund, equity, and mutual fund.",
  },
] as const;

export default function HeroScreenshotCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const activeShot = HERO_SHOTS[activeIndex];

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
      () => setActiveIndex((current) => (current + 1) % HERO_SHOTS.length),
      ROTATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused, isVisible, reduceMotion]);

  return (
    <aside
      className="hero-audit-card hero-shot-carousel"
      aria-label="Ask Linc product screenshots"
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
        <b>ASK LINC · {activeShot.label}</b>
        <em>{String(activeIndex + 1).padStart(2, "0")} OF {String(HERO_SHOTS.length).padStart(2, "0")}</em>
      </span>
      <div className="hero-shot-frame" key={activeShot.id}>
        {HERO_SHOTS.map((shot, index) => (
          <Image
            className="hero-shot-image"
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            quality={95}
            sizes="(max-width: 980px) 100vw, 640px"
            priority={index === 0}
            hidden={index !== activeIndex}
            key={shot.id}
          />
        ))}
      </div>
      <p className="hero-shot-caption">{activeShot.caption}</p>
      <nav className="hero-example-controls hero-shot-controls" aria-label="Choose a product screenshot">
        {HERO_SHOTS.map((shot, index) => (
          <button
            type="button"
            aria-current={index === activeIndex ? "true" : undefined}
            aria-label={`Show ${shot.controlLabel} screenshot`}
            key={shot.id}
            onClick={() => {
              setIsPaused(true);
              setActiveIndex(index);
            }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {shot.controlLabel}
          </button>
        ))}
      </nav>
      <footer>Your numbers · Assumptions · Math · Checks · Sources</footer>
    </aside>
  );
}
