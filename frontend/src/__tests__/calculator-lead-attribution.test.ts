import { readCalculatorLeadAttribution } from '@/lib/calculator-lead-attribution';
import { rememberLanding } from '@/lib/landing-attribution';

function setCookie(value: string): void {
  Object.defineProperty(document, 'cookie', { value, writable: true, configurable: true });
}

describe('calculator lead attribution', () => {
  beforeEach(() => window.localStorage.clear());

  it('captures allowlisted campaign data and strips the referrer query', () => {
    window.history.replaceState({}, '', '/retirement-calculator?retirement_age=62&utm_source=google&utm_medium=cpc&utm_campaign=age-62&utm_term=retire+at+62&gclid=click_123');
    Object.defineProperty(document, 'referrer', {
      value: 'https://www.google.com/search?q=private-query',
      configurable: true,
    });
    setCookie('_ga=GA1.1.123.456; _ga_G0QBF34C7VK=GS2.1.s1700000000$o1');

    expect(readCalculatorLeadAttribution()).toEqual({
      landingPage: '/retirement-calculator',
      referrer: 'https://www.google.com/search',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'age-62',
      utmTerm: 'retire at 62',
      gclid: 'click_123',
      gaClientId: '123.456',
      gaSessionId: '1700000000',
    });
  });

  it('carries a remembered campaign landing to a form on another page', () => {
    setReferrer('https://www.google.com/search?q=private-query');
    window.history.replaceState({}, '', '/coast-fire?utm_source=google&utm_medium=cpc&utm_campaign=coast&gclid=abc');
    rememberLanding();

    // Three pages later, from an internal link, on the signup page.
    setReferrer('https://asklinc.com/blog/coast-fire');
    window.history.replaceState({}, '', '/getstarted?source=coast-fire-calculator');
    setCookie('');

    expect(readCalculatorLeadAttribution()).toEqual({
      landingPage: '/coast-fire',
      referrer: 'https://www.google.com/search',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'coast',
      gclid: 'abc',
    });
  });
});

function setReferrer(value: string): void {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}
