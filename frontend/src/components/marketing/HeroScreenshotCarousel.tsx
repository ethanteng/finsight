"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const ROTATION_MS = 4500;

const HERO_SHOTS = [
  {
    id: "decision",
    zoom: 2,
    pan: "horizontal",
    label: "DECISION WORKSPACE",
    controlLabel: "Decision",
    caption: "Ask what you are trying to decide. Linc answers with the metrics and accounts behind it.",
    src: "/images/hero/screenshot_1.png",
    alt: "The Ask Linc decision workspace answering a question about high inflation and weak markets, with key metrics for survival rate, withdrawal rate, and CPI inflation next to a connected financial overview.",
  },
  {
    id: "takeaways",
    zoom: 1.3,
    pan: "vertical",
    label: "TAKEAWAYS & NEXT STEPS",
    controlLabel: "Takeaways",
    caption: "What the numbers mean for you, and what to do about them.",
    src: "/images/hero/screenshot_2.png",
    alt: "Takeaways and action items from an Ask Linc answer, explaining portfolio concentration, inflation against the spending target, and what to model next.",
  },
  {
    id: "net-worth",
    zoom: 1.85,
    pan: "horizontal",
    label: "YOUR FINANCIAL PICTURE",
    controlLabel: "Net worth",
    caption: "Cash, investments, property, and debt tracked together over time.",
    src: "/images/hero/screenshot_3.png",
    alt: "An Ask Linc Financial Metrics Over Time chart plotting net worth, total cash, total investments, and home value, with summary tiles beneath it.",
  },
  {
    id: "portfolio",
    zoom: 1.5,
    pan: "vertical",
    label: "INVESTMENT PORTFOLIO",
    controlLabel: "Portfolio",
    caption: "Holdings and allocation across every connected investment account.",
    src: "/images/hero/screenshot_4.png",
    alt: "An Ask Linc investment portfolio overview with total portfolio value, holdings and securities counts, and asset allocation across ETFs, target date funds, equities, and mutual funds.",
  },
] as const;

// At zoom Z the image is Z times the frame along its travel axis, so scrolling
// from one end to the other covers (Z - 1) / Z of it. Stop just short of the
// far edge so the pan never slams into it.
function panStyle(zoom: number): CSSProperties {
  return {
    "--hero-shot-zoom": zoom,
    "--hero-shot-travel": `${-((zoom - 1) / zoom) * 92}%`,
  } as CSSProperties;
}

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
      style={{ "--hero-shot-duration": `${ROTATION_MS}ms` } as CSSProperties}
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
            fill
            quality={95}
            sizes="(max-width: 980px) 200vw, 1280px"
            data-pan={shot.pan}
            style={panStyle(shot.zoom)}
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
