/**
 * The marketing teaser video, swappable without a deploy.
 *
 * `TeaserVideo` doesn't name a video. Its player loads /video/embed, and that
 * route sends it on to YouTube. Which video is the `video` item in the Vercel
 * Global Config (formerly Edge Config) connected to the frontend project: an
 * item can be changed in the dashboard and is read on the next request, where
 * an environment variable only reaches deployments made after it changed.
 *
 * Anything that stops a video being read — no Global Config connected, no
 * `video` item, a value that isn't a YouTube video, Global Config slow or
 * down — plays DEFAULT_VIDEO, so a typo in the dashboard can't leave the
 * player empty.
 */

export const DEFAULT_VIDEO = 'GRBboPyuL5U';
const ITEM = 'video';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const READ_TIMEOUT_MS = 1500;

/**
 * Browsers ask every time; the CDN answers from its copy for a minute, so a
 * change in the dashboard reaches visitors within a minute or two.
 */
export const TEASER_VIDEO_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=600';

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

/**
 * The `video` item, read over Global Config's REST API with the connection
 * string Vercel puts in GLOBAL_CONFIG
 * (`https://global-config.vercel.com/<id>?token=<token>`), or in EDGE_CONFIG
 * for a store connected before Edge Config was renamed. Read by hand, as
 * Uncloud's landing page does, rather than adding an SDK for one item.
 */
async function configuredVideo(env: NodeJS.ProcessEnv): Promise<unknown> {
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
      `${connection.origin}${connection.pathname}/item/${ITEM}`,
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

/** The video the teaser should play right now. */
export async function teaserVideoId(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return videoId(await configuredVideo(env)) ?? DEFAULT_VIDEO;
}

/**
 * YouTube's privacy-enhanced host sets no cookies until the visitor presses
 * play. It is also the only YouTube host frame-src allows, so an embed from
 * youtube.com itself would be refused.
 */
export function teaserEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
}
