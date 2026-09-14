import { readCalculatorLeadAttribution } from '@/lib/calculator-lead-attribution';

function setCookie(value: string): void {
  Object.defineProperty(document, 'cookie', { value, writable: true, configurable: true });
}

describe('calculator lead attribution', () => {
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
});
