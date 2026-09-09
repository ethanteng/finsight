import { classifyIntent, INTENT_RULES } from '../../marketing-analytics/intent-rules';

describe('marketing intent classification', () => {
  it.each([
    [{ landingPage: '/retirement-calculator', medium: 'cpc', campaign: 'retirement calculator' }, 'retirement_high_intent'],
    [{ landingPage: '/vs/boldin', medium: 'organic' }, 'competitor_comparison'],
    [{ source: 'google', medium: 'cpc', campaign: 'Ask Linc brand' }, 'paid_brand'],
    [{ source: 'google', medium: 'cpc', campaign: 'financial planner' }, 'paid_nonbrand'],
    [{ searchTerm: 'how much savings does average american have', medium: 'organic' }, 'savings_net_worth'],
    [{ searchTerm: 'best ai financial planner', medium: 'organic' }, 'generic_ai_financial_planning'],
    [{ source: '(direct)', medium: '(none)', landingPage: '/' }, 'brand_direct'],
    [{ source: 'google', medium: 'organic', landingPage: '/blog/market-update' }, 'blog_informational_seo'],
    [{ source: 'newsletter', medium: 'email', landingPage: '/features' }, 'unknown'],
  ])('classifies %o as %s', (input, expected) => {
    expect(classifyIntent(input).id).toBe(expected);
  });

  it('keeps Unknown last so every session receives exactly one cohort', () => {
    expect(INTENT_RULES[INTENT_RULES.length - 1].id).toBe('unknown');
    expect(INTENT_RULES.filter(rule => rule.matches({ source: 'newsletter', medium: 'email' })).map(rule => rule.id))
      .toContain('unknown');
  });

  it('lets specific retirement intent outrank the paid catch-all', () => {
    expect(classifyIntent({
      source: 'google',
      medium: 'cpc',
      campaign: 'no brand calculator terms',
      landingPage: '/retirement-calculator',
    }).id).toBe('retirement_high_intent');
  });

  it('does not treat GA placeholder creative or bare search campaigns as paid', () => {
    expect(classifyIntent({
      source: 'google',
      medium: 'organic',
      campaign: '(not set)',
      creative: '(not set)',
      adId: '',
      landingPage: '/features',
    }).id).toBe('unknown');

    expect(classifyIntent({
      source: 'google',
      medium: 'organic',
      campaign: 'brand_search_seo',
      landingPage: '/features',
    }).id).toBe('unknown');

    expect(classifyIntent({
      source: 'google',
      medium: 'referral',
      campaign: 'pmax_prospecting',
      landingPage: '/features',
    }).id).toBe('paid_nonbrand');
  });
});
