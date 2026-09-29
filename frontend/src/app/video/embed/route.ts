/**
 * Where the teaser video's player points: a redirect to YouTube, or our own
 * player page for a video file. `?autoplay=1`, which `TeaserVideo` adds once
 * the player is on screen, starts it muted. See `lib/teaser-video` for why the
 * page doesn't name the video itself.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  PLAYER_POLICY,
  TEASER_VIDEO_CACHE_CONTROL,
  playerPage,
  teaserEmbedUrl,
  teaserVideo,
} from '@/lib/teaser-video';

/** Read on request, never frozen into the build; the CDN does the caching. */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const autoplay = request.nextUrl.searchParams.get('autoplay') === '1';
  const video = await teaserVideo();
  if ('youtube' in video) {
    const response = NextResponse.redirect(teaserEmbedUrl(video.youtube, autoplay), 302);
    response.headers.set('Cache-Control', TEASER_VIDEO_CACHE_CONTROL);
    // No Referrer-Policy here: a redirect's policy replaces the iframe's, and
    // YouTube refuses to play an embed that arrives without a referrer.
    return response;
  }
  return new Response(playerPage(video, autoplay), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': TEASER_VIDEO_CACHE_CONTROL,
      'Content-Security-Policy': PLAYER_POLICY,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
