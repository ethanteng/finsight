/**
 * The marketing teaser video, swappable without a deploy.
 *
 * `TeaserVideo` doesn't name a video. Its player loads /video/embed, and that
 * route decides what the player shows. Once half the player is on screen,
 * `TeaserVideo` swaps it to /video/embed?autoplay=1, which starts it muted: no
 * browser lets a page start sound by itself.
 *
 * Which video is the `video` item in the Vercel Global Config (formerly Edge
 * Config) connected to the frontend project: an item can be changed in the
 * dashboard and is read on the next request, where an environment variable
 * only reaches deployments made after it changed. The item is one of:
 *
 *   "GRBboPyuL5U" or any YouTube link   YouTube: /video/embed redirects there
 *   "https://…/teaser.mp4"              a video file, played by our own player page
 *   { "mp4": "https://…", "poster": "https://…", "captions": "https://…" }
 *                                       the same, with a poster frame and WebVTT captions
 *
 * Anything that stops a video being read — no Global Config connected, no
 * `video` item, a value that is none of those, Global Config slow or down —
 * plays DEFAULT_VIDEO, so a typo in the dashboard can't leave the player
 * empty. See docs/TEASER_VIDEO.md for setup and for hosting a video file.
 */

export const DEFAULT_VIDEO = 'GRBboPyuL5U';
export const DEFAULT_VIDEO_ITEM = 'video';
export const CASH_FLOW_VIDEO_ITEM = 'cash-flow-video';
export type VideoConfigItem = typeof DEFAULT_VIDEO_ITEM | typeof CASH_FLOW_VIDEO_ITEM;
const VIDEO_CONFIG_ITEMS = new Set<VideoConfigItem>([DEFAULT_VIDEO_ITEM, CASH_FLOW_VIDEO_ITEM]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const READ_TIMEOUT_MS = 1500;
const CAPTIONS_TIMEOUT_MS = 5000;
const MAX_CAPTIONS_CHARS = 1_000_000;

/**
 * Browsers ask every time; the CDN answers from its copy for a minute, so a
 * change in the dashboard reaches visitors within a minute or two.
 */
export const TEASER_VIDEO_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=600';

/**
 * The player page loads the video and poster from https and the captions from
 * this site, and nothing else at all; it has no script. Only this site may
 * frame it. It replaces the site-wide policy, which next.config.ts keeps off
 * /video/*: that policy's media and image sources would refuse a file host.
 */
export const PLAYER_POLICY =
  "default-src 'none'; media-src https: 'self'; img-src https:; style-src 'unsafe-inline'; frame-ancestors 'self'";

export type TeaserVideoSource =
  | { youtube: string }
  | { mp4: string; poster: string | null; captions: string | null };

/**
 * The YouTube video id in what somebody put in the dashboard: an id, or any
 * link to the video (watch, youtu.be, embed, shorts or live). Null when there
 * isn't one, so nothing but an id can reach the redirect.
 */
export function videoId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (VIDEO_ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  let found: string | null | undefined = null;
  if (host === 'youtu.be') found = url.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    found =
      url.searchParams.get('v') ??
      /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1];
  }
  return found && VIDEO_ID.test(found) ? found : null;
}

/** An https address, normalised by the URL parser (which percent-encodes quotes and brackets). */
function https(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
}

/**
 * What to play, or null when the value is none of the accepted shapes. A
 * poster or captions address that isn't https is left out rather than failing
 * the video.
 */
export function chooseVideo(value: unknown): TeaserVideoSource | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    const mp4 = https(item.mp4);
    return mp4 ? { mp4, poster: https(item.poster), captions: https(item.captions) } : null;
  }
  const id = videoId(value);
  if (id) return { youtube: id };
  const mp4 = https(value);
  return mp4 && /\.mp4$/i.test(new URL(mp4).pathname)
    ? { mp4, poster: null, captions: null }
    : null;
}

/**
 * The `video` item, read over Global Config's REST API with the connection
 * string Vercel puts in GLOBAL_CONFIG
 * (`https://global-config.vercel.com/<id>?token=<token>`), or in EDGE_CONFIG
 * for a store connected before Edge Config was renamed. Read by hand, as
 * Uncloud's landing page does, rather than adding an SDK for one item.
 */
export function videoConfigItem(value: unknown): VideoConfigItem {
  return typeof value === 'string' && VIDEO_CONFIG_ITEMS.has(value as VideoConfigItem)
    ? value as VideoConfigItem
    : DEFAULT_VIDEO_ITEM;
}

async function configuredVideo(env: NodeJS.ProcessEnv, item: VideoConfigItem): Promise<unknown> {
  let connection: URL;
  try {
    connection = new URL(env.GLOBAL_CONFIG || env.EDGE_CONFIG || '');
  } catch {
    return undefined;
  }
  const token = connection.searchParams.get('token');
  if (!token) return undefined;
  try {
    const response = await fetch(
      `${connection.origin}${connection.pathname}/item/${item}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        // The CDN already holds each answer for a minute; Next's data cache
        // must not hold it for longer.
        cache: 'no-store',
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      },
    );
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

/** What the teaser should play right now. */
export async function teaserVideo(
  env: NodeJS.ProcessEnv = process.env,
  item: VideoConfigItem = DEFAULT_VIDEO_ITEM,
): Promise<TeaserVideoSource> {
  return chooseVideo(await configuredVideo(env, item)) ?? { youtube: DEFAULT_VIDEO };
}

/**
 * YouTube's privacy-enhanced host, the only YouTube host frame-src allows, so
 * an embed from youtube.com itself would be refused. It stores nothing about a
 * visitor until a video plays. Inline, because iOS autoplays nothing else;
 * muted when it starts by itself, because browsers autoplay nothing else, and
 * the player's own control unmutes it.
 */
export function teaserEmbedUrl(id: string, autoplay = false): string {
  const start = autoplay ? '&autoplay=1&mute=1' : '';
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1${start}`;
}

const attribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The page the iframe shows for a video file. Nothing but a <video>: native
 * controls, fullscreen through the iframe's `allowFullScreen`, and the frame's
 * own background around it. Autoplay starts it muted (the only autoplay
 * browsers allow) and inline (the only kind iOS allows). Otherwise, with a
 * poster nothing is downloaded until somebody presses Play; without one, just
 * enough for a first frame.
 */
export function playerPage(
  { mp4, poster, captions }: Extract<TeaserVideoSource, { mp4: string }>,
  autoplay = false,
  captionsPath = '/video/captions',
): string {
  const posterAttribute = poster ? ` poster="${attribute(poster)}"` : '';
  const start = autoplay ? 'autoplay muted' : `preload="${poster ? 'none' : 'metadata'}"`;
  // Same-origin, relayed by /video/captions, so the captions never depend on
  // the file host's CORS.
  const track = captions
    ? `\n  <track kind="captions" src="${attribute(captionsPath)}" srclang="en" label="English">`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ask Linc teaser video</title>
<style>
  html, body { margin: 0; height: 100%; background: #102319; }
  video { display: block; width: 100%; height: 100%; background: #102319; }
</style>
</head>
<body>
<video controls playsinline ${start}${posterAttribute}>
  <source src="${attribute(mp4)}" type="video/mp4">${track}
</video>
</body>
</html>
`;
}

/** The captions file's text when it is WebVTT of a sensible size, or null. */
export async function fetchCaptions(url: string): Promise<string | null> {
  try {
    const answer = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(CAPTIONS_TIMEOUT_MS),
    });
    if (!answer.ok) return null;
    const text = await answer.text();
    // An error page or the wrong file served in its place is not passed off as captions.
    if (text.length > MAX_CAPTIONS_CHARS || !text.replace(/^﻿/, '').startsWith('WEBVTT')) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}
