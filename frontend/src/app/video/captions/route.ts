/**
 * The teaser video file's captions, relayed from wherever the file is hosted
 * so the player loads them from this site and never depends on that host's
 * CORS headers. Anything that isn't WebVTT is a 404. See `lib/teaser-video`.
 */

import {
  TEASER_VIDEO_CACHE_CONTROL,
  fetchCaptions,
  teaserVideo,
} from '@/lib/teaser-video';

/** Read on request, never frozen into the build; the CDN does the caching. */
export const dynamic = 'force-dynamic';

export async function GET() {
  const video = await teaserVideo();
  const text = 'mp4' in video && video.captions ? await fetchCaptions(video.captions) : null;
  const headers = {
    'Cache-Control': TEASER_VIDEO_CACHE_CONTROL,
    'X-Content-Type-Options': 'nosniff',
  };
  if (text === null) {
    return new Response('No captions.\n', {
      status: 404,
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(text, {
    headers: { ...headers, 'Content-Type': 'text/vtt; charset=utf-8' },
  });
}
