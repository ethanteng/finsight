import { buildBeachheadScorecard, isCoastFireSession } from '../../marketing-analytics/beachhead-scorecard';
import { FUNNEL_EVENT_NAMES, type AnalyticsSession, type FirstPartySummary } from '../../marketing-analytics/types';

const firstParty: FirstPartySummary = {
  accountsCreated: 10,
  accountsCurrentlyVerified: 8,
  createdAccountsWithLogin: 7,
  createdAccountsWithConversation: 4,
  createdAccountsWithFinancialConnection: 5,
  createdAccountsCurrentlyPaid: 2,
  subscriptionsCreated: 6,
  currentlyTrialingAccounts: 4,
  note: 'test',
};

function session(id: string, overrides: Partial<AnalyticsSession> = {}): AnalyticsSession {
  return {
    id,
    userId: `user-${id}`,
    sessionDate: '2026-09-10',
    acquisition: {
      source: 'google', medium: 'organic', channel: 'Organic Search', campaign: '(not set)',
      landingPage: '/retirement-calculator', searchTerm: '(not set)', creative: '(not set)', adId: '', referrer: '',
    },
    hostname: 'asklinc.com',
    device: 'desktop',
    browser: 'Chrome',
    operatingSystem: 'Macintosh',
    country: 'United States',
    region: 'California',
    city: 'San Francisco',
    visitorType: 'new',
    trafficQuality: 'human',
    exclusionReasons: [],
    engaged: true,
    engagementSeconds: 20,
    pageViews: 2,
    eventCount: 2,
    scrollEvents: 0,
    eventCounts: {},
    firstEventAt: {},
    ...overrides,
  };
}

/*
 * Each journey reports its own result event. The Coast FIRE page runs its
 * formula in the browser and emits `coast_fire_calculated`; it never emits
 * `retirement_model_run`, so a coast fixture must not either.
 */
function resultEventFor(coast: boolean): string {
  return coast ? 'coast_fire_calculated' : 'retirement_model_run';
}

function completedJourney(id: string, ctaEvent: string, coast = false): AnalyticsSession {
  const resultEvent = resultEventFor(coast);
  const firstEventAt: Record<string, number> = Object.fromEntries(
    FUNNEL_EVENT_NAMES.map((event, index) => [event, (index + 20) * 1_000_000]),
  );
  // Result must precede the plan CTA; the cross-sell is visible before a run.
  firstEventAt[resultEvent] = 10_000_000;
  firstEventAt[ctaEvent] = firstEventAt.start_free_click;
  return session(id, {
    acquisition: {
      source: 'newsletter', medium: 'email', channel: 'Other', campaign: coast ? 'coast fire launch' : '(not set)',
      landingPage: coast ? '/coast-fire-calculator' : '/retirement-calculator',
      searchTerm: '(not set)', creative: '(not set)', adId: '', referrer: '',
    },
    eventCounts: {
      [resultEvent]: 1,
      [ctaEvent]: 1,
      ...Object.fromEntries(FUNNEL_EVENT_NAMES.map(event => [event, 1])),
    },
    firstEventAt,
  });
}

describe('Coast FIRE beachhead scorecard', () => {
  it('requires an explicit Coast FIRE signal instead of relabeling generic retirement traffic', () => {
    expect(isCoastFireSession(session('generic'))).toBe(false);
    expect(isCoastFireSession(session('campaign', {
      acquisition: {
        source: 'google', medium: 'cpc', channel: 'Paid', campaign: 'Coast_Fire_Search',
        landingPage: '/retirement-calculator', searchTerm: '(not set)', creative: '(not set)', adId: '1', referrer: '',
      },
    }))).toBe(true);
    expect(isCoastFireSession(session('touch', { eventCounts: { coast_fire_touch: 1 } }))).toBe(true);
  });

  it('shows a measured current-calculator baseline but keeps the unlaunched Coast journey blank', () => {
    const report = buildBeachheadScorecard({
      current: [
        completedJourney('complete', 'quickplan_cross_sell_click'),
        session('visit-only'),
      ],
      previous: [],
      ga4Live: true,
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });

    expect(report.state).toBe('prelaunch');
    expect(report.coastFireJourney.every(stage => stage.value === null)).toBe(true);
    expect(report.currentCalculatorBaseline.map(stage => stage.value)).toEqual([2, 1, 1, 1]);
    expect(report.downstream.financialConnectionRate.value).toBe(0.5);
    expect(report.downstream.activationRate.value).toBe(0.4);
    expect(report.downstream.paidRate.value).toBe(0.2);
  });

  it('measures the Coast journey once a dedicated signal is observed', () => {
    const report = buildBeachheadScorecard({
      current: [
        completedJourney('coast-complete', 'coast_fire_plan_cta_click', true),
        session('coast-visit', {
          acquisition: {
            source: 'google', medium: 'organic', channel: 'Organic Search', campaign: '(not set)',
            landingPage: '/coast-fire-calculator', searchTerm: '(not set)', creative: '(not set)', adId: '', referrer: '',
          },
        }),
      ],
      previous: [],
      ga4Live: true,
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
      experimentLive: true,
    });

    expect(report.state).toBe('measuring');
    expect(report.coastFireJourney.map(stage => stage.value)).toEqual([2, 1, 1, 1]);
    expect(report.currentCalculatorBaseline.map(stage => stage.value)).toEqual([0, 0, 0, 0]);
  });

  /*
   * Each journey's result event is the whole funnel below "Qualified visits":
   * plan CTAs are counted only among result sessions. Reading the retirement
   * calculator's event for the Coast journey silently zeroed both stages.
   */
  it('reads each journey result from the event its own page emits', () => {
    const coastOnRetirementEvent = completedJourney('coast-wrong-event', 'coast_fire_plan_cta_click', true);
    coastOnRetirementEvent.eventCounts = {
      ...coastOnRetirementEvent.eventCounts,
      coast_fire_calculated: 0,
      retirement_model_run: 1,
    };
    coastOnRetirementEvent.firstEventAt = {
      ...coastOnRetirementEvent.firstEventAt,
      retirement_model_run: coastOnRetirementEvent.firstEventAt.coast_fire_calculated,
    };
    delete coastOnRetirementEvent.firstEventAt.coast_fire_calculated;

    const report = buildBeachheadScorecard({
      current: [
        completedJourney('coast-right-event', 'coast_fire_plan_cta_click', true),
        coastOnRetirementEvent,
      ],
      previous: [],
      ga4Live: true,
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
      experimentLive: true,
    });

    // Two qualified visits, but only the session emitting coast_fire_calculated
    // reaches the result stage and can have its plan CTA credited.
    expect(report.coastFireJourney.map(stage => stage.value)).toEqual([2, 1, 1, 1]);
    expect(report.coastFireJourney.find(stage => stage.id === 'calculator_result')?.note)
      .toContain('coast_fire_calculated');
  });

  it('does not count a plan CTA that precedes the calculator result', () => {
    const premature = completedJourney('premature', 'quickplan_cross_sell_click');
    premature.firstEventAt.retirement_model_run = 80_000_000;
    premature.firstEventAt.quickplan_cross_sell_click = 20_000_000;
    const report = buildBeachheadScorecard({
      current: [premature],
      previous: [],
      ga4Live: true,
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });

    expect(report.currentCalculatorBaseline.map(stage => stage.value)).toEqual([1, 1, 0, 0]);
  });

  it('does not attribute a trial completed before the journey-specific plan CTA', () => {
    const convertedEarlier = completedJourney('converted-earlier', 'quickplan_cross_sell_click');
    Object.assign(convertedEarlier.firstEventAt, Object.fromEntries(
      FUNNEL_EVENT_NAMES.map((event, index) => [event, (index + 1) * 1_000_000]),
    ));
    convertedEarlier.firstEventAt.retirement_model_run = 50_000_000;
    convertedEarlier.firstEventAt.quickplan_cross_sell_click = 60_000_000;

    const report = buildBeachheadScorecard({
      current: [convertedEarlier],
      previous: [],
      ga4Live: true,
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });

    expect(report.currentCalculatorBaseline.map(stage => stage.value)).toEqual([1, 1, 1, 0]);
  });

  it('does not call an uncovered trial completion zero', () => {
    const report = buildBeachheadScorecard({
      current: [completedJourney('complete', 'quickplan_cross_sell_click')],
      previous: [],
      ga4Live: true,
      funnelCoverageComplete: false,
      previousFunnelCoverageComplete: false,
      firstParty,
    });

    expect(report.currentCalculatorBaseline[report.currentCalculatorBaseline.length - 1]?.value).toBeNull();
  });
});
