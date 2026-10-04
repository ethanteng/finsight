"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_CONFIG_ITEM = "video";
type VideoConfigItem = "video" | "cash-flow-video";

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

function playerSrc(configItem: VideoConfigItem, autoplay: boolean): string {
  const params = new URLSearchParams();
  if (configItem !== DEFAULT_CONFIG_ITEM) params.set("item", configItem);
  if (autoplay) params.set("autoplay", "1");
  const query = params.toString();
  return `/video/embed${query ? `?${query}` : ""}`;
}

/**
 * The video starts by itself, muted, the first time half of it is on screen,
 * so nobody scrolls down to find it already partway through. Skipped for
 * anyone who asks for reduced motion or to save data, and without JavaScript
 * or IntersectionObserver the player simply waits for Play.
 *
 * `configItem` selects which allowlisted Vercel Global Config item the shared
 * /video/embed route reads. The homepage keeps the original `video` item;
 * feature pages can use their own item without duplicating player behavior.
 */
export function TeaserVideo({
  configItem = DEFAULT_CONFIG_ITEM,
  title = "Ask Linc teaser video",
}: {
  configItem?: VideoConfigItem;
  title?: string;
}) {
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
        src={playerSrc(configItem, autoplay)}
        title={title}
        loading="lazy"
        allow={PLAYER_FEATURES}
        // YouTube refuses to play an embed that arrives without a referrer.
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}
