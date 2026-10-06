/**
 * @jest-environment-options {"url": "https://asklinc.com/"}
 */
import {
  LANDING_ATTRIBUTION_TTL_MS,
  readLandingAttribution,
  rememberLanding,
} from '@/lib/landing-attribution';

const KEY = 'asklinc.landing-attribution.v1';
const DAY = 24 * 60 * 60 * 1000;

function visit(path: string, referrer = ''): void {
  window.history.replaceState({}, '', path);
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

describe('landing attribution', () => {
  beforeEach(() => {
    window.localStorage.clear();
    visit('/');
  });

  it('remembers a tagged landing, with the referrer stripped of its query', () => {
    visit('/coast-fire?utm_source=google&utm_campaign=coast&gclid=abc&email=me@example.com', 'https://www.google.com/search?q=private');
    rememberLanding(1_000);

    expect(readLandingAttribution(2_000)).toEqual({
      landingPage: '/coast-fire',
      referrer: 'https://www.google.com/search',
      utmSource: 'google',
      utmCampaign: 'coast',
      gclid: 'abc',
    });
  });

  /*
   * A no-trial lead who came from an ad and later clicks a follow-up email
   * was acquired by the ad. The server keeps a calculator lead's own
   * attribution for the same reason.
   */
  it('keeps the first campaign landing when a later one arrives', () => {
    visit('/coast-fire?utm_source=google&utm_medium=cpc');
    rememberLanding(1_000);
    visit('/getstarted?utm_source=mailerlite&utm_medium=email');
    rememberLanding(2_000);

    expect(readLandingAttribution(3_000)).toMatchObject({ landingPage: '/coast-fire', utmSource: 'google' });
  });

  it('keeps an outside referral only until a campaign landing replaces it', () => {
    visit('/blog/coast-fire', 'https://www.bing.com/search');
    rememberLanding(1_000);
    expect(readLandingAttribution(1_500)).toEqual({ landingPage: '/blog/coast-fire', referrer: 'https://www.bing.com/search' });

    visit('/blog/other', 'https://duckduckgo.com/');
    rememberLanding(1_600);
    expect(readLandingAttribution(1_700)).toMatchObject({ landingPage: '/blog/coast-fire' });

    visit('/retirement-calculator?utm_source=newsletter');
    rememberLanding(2_000);
    expect(readLandingAttribution(3_000)).toEqual({ landingPage: '/retirement-calculator', utmSource: 'newsletter' });
  });

  it('ignores direct visits and our own pages as referrers', () => {
    visit('/pricing');
    rememberLanding(1_000);
    visit('/getstarted', 'https://asklinc.com/pricing');
    rememberLanding(2_000);

    expect(readLandingAttribution(3_000)).toBeNull();
  });

  it('forgets a landing after 90 days', () => {
    visit('/coast-fire?utm_source=google');
    rememberLanding(0);

    expect(readLandingAttribution(LANDING_ATTRIBUTION_TTL_MS)).not.toBeNull();
    expect(readLandingAttribution(LANDING_ATTRIBUTION_TTL_MS + DAY)).toBeNull();

    // And an expired one no longer blocks a new campaign landing.
    visit('/retirement-calculator?utm_source=newsletter');
    rememberLanding(LANDING_ATTRIBUTION_TTL_MS + DAY);
    expect(readLandingAttribution(LANDING_ATTRIBUTION_TTL_MS + DAY + 1)).toMatchObject({ utmSource: 'newsletter' });
  });

  it('treats edited or malformed storage as nothing remembered', () => {
    window.localStorage.setItem(KEY, '{');
    expect(readLandingAttribution(1_000)).toBeNull();

    window.localStorage.setItem(KEY, JSON.stringify({
      version: 1, savedAt: 500, kind: 'campaign', landingPage: 'https://evil.example/', utmSource: 'x',
    }));
    expect(readLandingAttribution(1_000)).toBeNull();

    window.localStorage.setItem(KEY, JSON.stringify({
      version: 1, savedAt: 500, kind: 'campaign', landingPage: '/coast-fire', utmSource: 7, injected: 'nope',
    }));
    expect(readLandingAttribution(1_000)).toEqual({ landingPage: '/coast-fire' });
  });

  it('does not fail when storage is blocked', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      visit('/coast-fire?utm_source=google');
      expect(() => rememberLanding(1_000)).not.toThrow();
      expect(readLandingAttribution(2_000)).toBeNull();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
