/**
 * Where the teaser video's player points. It sends the player on to whichever
 * video is configured; see `lib/teaser-video` for why the page doesn't name
 * the video itself.
 */

import { NextResponse } from 'next/server';
import {
  TEASER_VIDEO_CACHE_CONTROL,
  teaserEmbedUrl,
  teaserVideoId,
} from '@/lib/teaser-video';

/** Read on request, never frozen into the build; the CDN does the caching. */
export const dynamic = 'force-dynamic';

export async function GET() {
  const response = NextResponse.redirect(teaserEmbedUrl(await teaserVideoId()), 302);
  response.headers.set('Cache-Control', TEASER_VIDEO_CACHE_CONTROL);
  // No Referrer-Policy here: a redirect's policy replaces the iframe's, and
  // YouTube refuses to play an embed that arrives without a referrer.
  return response;
}
