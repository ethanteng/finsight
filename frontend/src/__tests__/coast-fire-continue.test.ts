/**
 * @jest-environment node
 *
 * The route handler runs on the server, and `next/server` is built on the web
 * Request and Response, which jsdom does not provide.
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/coast-fire/continue/route';
import { COAST_FIRE_REF_COOKIE } from '@/lib/coast-fire-signup-context';

const TOKEN = 'a'.repeat(48);

function visit(url: string) {
  return GET(new NextRequest(new Request(url)));
}

describe('/coast-fire/continue', () => {
  /*
   * The whole point of this handler. Google Tag Manager loads in <head> on
   * every page and a GA4 pageview records the full URL, so a token left in the
   * address of a rendered page is handed to analytics and every other tag —
   * and it resolves to an address and seven financial figures for 90 days.
   */
  it('redirects to a URL with no token in it', () => {
    const response = visit(`https://asklinc.com/coast-fire/continue?ref=${TOKEN}`);

    expect(response.status).toBe(302);
    const location = response.headers.get('location')!;
    expect(location).toBe('https://asklinc.com/getstarted?source=coast-fire-calculator');
    expect(location).not.toContain(TOKEN);
  });

  it('hands the token over in a short-lived cookie scoped to the page that spends it', () => {
    const response = visit(`https://asklinc.com/coast-fire/continue?ref=${TOKEN}`);

    const cookie = response.cookies.get(COAST_FIRE_REF_COOKIE)!;
    expect(cookie.value).toBe(TOKEN);
    expect(cookie.path).toBe('/getstarted');
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.secure).toBe(true);
    expect(cookie.maxAge).toBeLessThanOrEqual(10 * 60);
  });

  it('sets no cookie for a token that is not one of ours', () => {
    for (const ref of ['', 'short', `${TOKEN}extra`, 'ZZZ' + TOKEN.slice(3)]) {
      const response = visit(`https://asklinc.com/coast-fire/continue?ref=${ref}`);

      expect(response.status).toBe(302);
      expect(response.cookies.get(COAST_FIRE_REF_COOKIE)).toBeUndefined();
    }
  });

  /* A bare visit still has to land somewhere that works. */
  it('redirects with no token at all', () => {
    const response = visit('https://asklinc.com/coast-fire/continue');

    expect(response.headers.get('location')).toBe(
      'https://asklinc.com/getstarted?source=coast-fire-calculator',
    );
    expect(response.cookies.get(COAST_FIRE_REF_COOKIE)).toBeUndefined();
  });

  /* A permanent redirect is exactly what a browser would cache and replay. */
  it('is never cached', () => {
    const response = visit(`https://asklinc.com/coast-fire/continue?ref=${TOKEN}`);

    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
