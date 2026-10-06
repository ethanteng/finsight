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

  /*
   * An existing account's email: the same handover, but to sign-in, which
   * attaches the run. The cookie follows it there and goes nowhere else.
   */
  it('sends a sign-in link to sign-in, with the cookie scoped there', () => {
    const response = visit(`https://asklinc.com/coast-fire/continue?ref=${TOKEN}&to=sign-in`);

    expect(response.status).toBe(302);
    const location = response.headers.get('location')!;
    expect(location).toBe('https://asklinc.com/login?source=coast-fire-calculator');
    expect(location).not.toContain(TOKEN);
    const cookie = response.cookies.get(COAST_FIRE_REF_COOKIE)!;
    expect(cookie.value).toBe(TOKEN);
    expect(cookie.path).toBe('/login');
  });

  /* Only the one value picks sign-in; anything else is the signup link. */
  it('ignores any other destination it is handed', () => {
    const response = visit(`https://asklinc.com/coast-fire/continue?ref=${TOKEN}&to=https://evil.example`);

    expect(response.headers.get('location')).toBe('https://asklinc.com/getstarted?source=coast-fire-calculator');
  });

  /*
   * A follow-up email's link: the same handover, with its marker passed on so
   * signup counts the click as its own entry rather than a results-email open.
   */
  it('passes a follow-up email’s marker on to signup, and nothing else', () => {
    const response = visit(`https://asklinc.com/coast-fire/continue?ref=${TOKEN}&entry=drip_email`);

    const location = response.headers.get('location')!;
    expect(location).toBe('https://asklinc.com/getstarted?source=coast-fire-calculator&entry=drip_email');
    expect(location).not.toContain(TOKEN);
    expect(response.cookies.get(COAST_FIRE_REF_COOKIE)!.value).toBe(TOKEN);

    for (const entry of ['results_page', 'results_email', 'https://evil.example']) {
      expect(visit(`https://asklinc.com/coast-fire/continue?ref=${TOKEN}&entry=${entry}`).headers.get('location'))
        .toBe('https://asklinc.com/getstarted?source=coast-fire-calculator');
    }
  });

  it('keeps the follow-up marker off the sign-in link', () => {
    const response = visit(`https://asklinc.com/coast-fire/continue?ref=${TOKEN}&to=sign-in&entry=drip_email`);

    expect(response.headers.get('location')).toBe('https://asklinc.com/login?source=coast-fire-calculator');
  });
});
