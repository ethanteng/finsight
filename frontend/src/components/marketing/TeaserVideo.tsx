"use client";

import { useEffect, useRef, useState } from "react";

// The player loads /video/embed, which shows whichever video is configured in
// Global Config: a redirect to YouTube, or our own player page for a video
// file (see lib/teaser-video). The video can change without a deploy.
const TEASER_VIDEO_SRC = "/video/embed";
const TEASER_AUTOPLAY_SRC = "/video/embed?autoplay=1";

// An `allow` feature with no origins is granted only to the origin in `src`,
// which is ours, and would not follow the redirect to YouTube. Naming both
// keeps autoplay and the rest working for either kind of video.
const PLAYER_ORIGINS = "'self' https://www.youtube-nocookie.com";
const PLAYER_FEATURES = [
  "accelerometer",
  "autoplay",
  "clipboard-write",
  "encrypted-media",
  "gyroscope",
  "picture-in-picture",
  "web-share",
]
  .map((feature) => `${feature} ${PLAYER_ORIGINS}`)
  .join("; ");

type SaveDataNavigator = Navigator & { connection?: { saveData?: boolean } };

/**
 * The teaser starts by itself, muted, the first time half of it is on screen,
 * so nobody scrolls down to find it already partway through (the lazy frame
 * loads well before it is visible). The page renders the plain player; this
 * swaps in the autoplay address then, and the route makes that a muted
 * autoplay, since no browser lets a page start sound on its own. Skipped for
 * anyone who asks for reduced motion or to save data, and without JavaScript
 * or IntersectionObserver the player simply waits for Play.
 */
export function TeaserVideo() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    const player = frame.current;
    if (
      !player ||
      !("IntersectionObserver" in window) ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      (navigator as SaveDataNavigator).connection?.saveData
    ) {
      return;
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watcher.disconnect();
        setAutoplay(true);
      },
      { threshold: 0.5 },
    );
    watcher.observe(player);
    return () => watcher.disconnect();
  }, []);

  return (
    <div className="teaser-video">
      <iframe
        ref={frame}
        src={autoplay ? TEASER_AUTOPLAY_SRC : TEASER_VIDEO_SRC}
        title="Ask Linc teaser video"
        loading="lazy"
        allow={PLAYER_FEATURES}
        // YouTube refuses to play an embed that arrives without a referrer.
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}
