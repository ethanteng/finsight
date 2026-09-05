"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const ROTATION_MS = 4500;

const HERO_SHOTS = [
  {
    id: "decision",
    ratio: 3448 / 1904,
    zoom: 1.45,
    pan: "vertical",
    label: "DECISION WORKSPACE",
    caption: "Ask what you are trying to decide. Linc answers with the metrics and accounts behind it.",
    src: "/images/hero/screenshot_1.png",
    alt: "The Ask Linc decision workspace answering a question about high inflation and weak markets, with key metrics for survival rate, withdrawal rate, and CPI inflation next to a connected financial overview.",
  },
  {
    id: "takeaways",
    ratio: 2000 / 1394,
    zoom: 1.15,
    pan: "vertical",
    label: "TAKEAWAYS & NEXT STEPS",
    caption: "What the numbers mean for you, and what to do about them.",
    src: "/images/hero/screenshot_2.png",
    alt: "Takeaways and action items from an Ask Linc answer, explaining portfolio concentration, inflation against the spending target, and what to model next.",
  },
  {
    id: "net-worth",
    ratio: 2352 / 1394,
    zoom: 1.85,
    pan: "horizontal",
    label: "YOUR FINANCIAL PICTURE",
    caption: "Cash, investments, property, and debt tracked together over time.",
    src: "/images/hero/screenshot_3.png",
    alt: "An Ask Linc Financial Metrics Over Time chart plotting net worth, total cash, total investments, and home value, with summary tiles beneath it.",
  },
  {
    id: "portfolio",
    ratio: 1626 / 1568,
    zoom: 1.5,
    pan: "vertical",
    label: "INVESTMENT PORTFOLIO",
    caption: "Holdings and allocation across every connected investment account.",
    src: "/images/hero/screenshot_4.png",
    alt: "An Ask Linc investment portfolio overview with total portfolio value, holdings and securities counts, and asset allocation across ETFs, target date funds, equities, and mutual funds.",
  },
] as const;

// Must match .hero-shot-frame's aspect-ratio in marketing.css.
const FRAME_RATIO = 16 / 10;

// Work out where the zoomed shot has to sit at each end of its travel.
//
// object-fit: contain fits the shot inside the frame and centres it, so along
// the axis it travels the shot covers `extent` of the frame and is padded by a
// `band` of empty frame at each end. Both scale with the zoom. The travel runs
// from the shot's leading edge flush with the frame's, to its trailing edge
// flush with the other — the way scrolling a page ends with its last line
// against the bottom of the viewport.
//
// Offsets are a percentage of the *unzoomed* element, because the translate is
// applied after the scale and so is multiplied by it. A shot that fills the
// frame on this axis has extent 1 and band 0, which reduces to a start of 0 and
// an end of -(Z - 1) / Z.
function panStyle(shot: (typeof HERO_SHOTS)[number]): CSSProperties {
  const { zoom, pan, ratio } = shot;
  const extent = pan === "vertical" ? Math.min(1, FRAME_RATIO / ratio) : Math.min(1, ratio / FRAME_RATIO);
  const band = (1 - extent) / 2;
  return {
    "--hero-shot-zoom": zoom,
    "--hero-shot-from": `${-band * 100}%`,
    "--hero-shot-to": `${Math.min(-band, 1 / zoom - band - extent) * 100}%`,
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
      onPointerEnter={() => setIsPaused(true)}
      onPointerLeave={() => setIsPaused(false)}
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
            style={panStyle(shot)}
            priority={index === 0}
            hidden={index !== activeIndex}
            key={shot.id}
          />
        ))}
      </div>
      <p className="hero-shot-caption">{activeShot.caption}</p>
    </aside>
  );
}
