import {
  hasLeadAttribution,
  hasPaidLeadAttribution,
  parseCalculatorLeadAttribution,
} from '../../services/calculator-lead-attribution';

describe('calculator lead attribution', () => {
  it('keeps allowlisted acquisition values and removes query data from referrers', () => {
    const attribution = parseCalculatorLeadAttribution({
      landingPage: '/retirement-calculator?retirement_age=62',
      referrer: 'https://www.google.com/search?q=private',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'retirement-62',
      utmTerm: 'retire at 62',
      utmContent: 'rsa-1',
      gclid: 'click_123-ABC',
      gaClientId: '123456789.1700000000',
      gaSessionId: '1700000000',
      ignored: 'not stored',
    });

    expect(attribution).toEqual({
      landingPage: '/retirement-calculator',
      referrer: 'https://www.google.com/search',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'retirement-62',
      utmTerm: 'retire at 62',
      utmContent: 'rsa-1',
      gclid: 'click_123-ABC',
      gaClientId: '123456789.1700000000',
      gaSessionId: '1700000000',
    });
    expect(hasLeadAttribution(attribution)).toBe(true);
    expect(hasPaidLeadAttribution(attribution)).toBe(true);
  });

  it('drops malformed telemetry without rejecting the request', () => {
    const attribution = parseCalculatorLeadAttribution({
      landingPage: 'https://evil.test/path',
      referrer: 'javascript:alert(1)',
      gclid: 'bad id with spaces',
      gaClientId: 'not-a-client',
      gaSessionId: 'not-a-session',
    });

    expect(attribution).toEqual({});
    expect(hasLeadAttribution(attribution)).toBe(false);
    expect(hasPaidLeadAttribution(attribution)).toBe(false);
  });
});
