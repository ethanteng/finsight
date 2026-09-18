import { buildBeachheadScorecard, COAST_FIRE_EXPERIMENT, isCoastFireSession } from '../../marketing-analytics/beachhead-scorecard';
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
  firstEventAt.start_free_click = 15_000_000;
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

  // The experiment ships live, so this path needs the flag passed explicitly.
  // It stays covered because turning the flag off is how the scorecard should
  // read if the page is ever pulled.
  it('shows a measured current-calculator baseline but keeps an unlaunched Coast journey blank', () => {
    const report = buildBeachheadScorecard({
      current: [
        completedJourney('complete', 'quickplan_cross_sell_click'),
        session('visit-only'),
      ],
      previous: [],
      ga4State: 'live',
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
      experimentLive: false,
    });

    expect(report.state).toBe('prelaunch');
    expect(report.coastFireJourney.every(stage => stage.value === null)).toBe(true);
    expect(report.currentCalculatorBaseline.map(stage => stage.value)).toEqual([2, 1, 1, 1]);
    expect(report.downstream.financialConnectionRate.value).toBe(0.5);
    expect(report.downstream.activationRate.value).toBe(0.4);
    expect(report.downstream.paidRate.value).toBe(0.2);
  });

  /*
   * The default is the shipped state. A caller that passes nothing must get the
   * launched journey, or the dashboard would keep showing a prelaunch banner
   * over a page that is public.
   */
  it('treats the Coast FIRE experiment as launched by default', () => {
    expect(COAST_FIRE_EXPERIMENT.live).toBe(true);

    const report = buildBeachheadScorecard({
      current: [completedJourney('coast-complete', 'coast_fire_plan_cta_click', true)],
      previous: [],
      ga4State: 'live',
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });

    expect(report.state).toBe('measuring');
    expect(report.coastFireJourney.map(stage => stage.value)).toEqual([1, 1, 1, 1]);
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
      ga4State: 'live',
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
      ga4State: 'live',
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
      ga4State: 'live',
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
      ga4State: 'live',
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
      ga4State: 'live',
      funnelCoverageComplete: false,
      previousFunnelCoverageComplete: false,
      firstParty,
    });

    expect(report.currentCalculatorBaseline[report.currentCalculatorBaseline.length - 1]?.value).toBeNull();
  });

  it.each([false, true])('retains confirmed CTA conversions without form interaction events (Coast FIRE: %s)', coast => {
    const converted = completedJourney('form-gap', coast ? 'coast_fire_plan_cta_click' : 'quickplan_cross_sell_click', coast);
    for (const event of ['trial_signup_started', 'trial_signup_submit']) {
      delete converted.firstEventAt[event];
      delete converted.eventCounts[event];
    }
    const report = buildBeachheadScorecard({ current: [converted], previous: [converted],
      ga4State: 'live', funnelCoverageComplete: true, previousFunnelCoverageComplete: true, firstParty });
    const journey = coast ? report.coastFireJourney : report.currentCalculatorBaseline;
    expect(journey.map(step => step.value)).toEqual([1, 1, 1, 1]);
    expect(journey.slice(-1)[0]).toMatchObject({ previous: 1, conversionRate: 1, previousConversionRate: 1 });
  });

  it('reports email capture as a branch and credits a later attributed return session', () => {
    const calculator = session('coast-email-request', {
      sessionDate: '2026-09-12',
      acquisition: {
        source: 'google', medium: 'cpc', channel: 'Paid', campaign: 'coast_fire',
        landingPage: '/coast-fire-calculator', searchTerm: 'coast fire calculator',
        creative: 'email-results', adId: '1', referrer: '',
      },
      eventCounts: { coast_fire_calculated: 1, coast_fire_results_emailed: 1 },
      firstEventAt: { coast_fire_calculated: 1_000_000, coast_fire_results_emailed: 2_000_000 },
    });
    const emailReturn = session('coast-email-return', {
      sessionDate: '2026-09-12',
      acquisition: {
        source: 'newsletter', medium: 'email', channel: 'Other', campaign: '(not set)',
        landingPage: '/getstarted', searchTerm: '(not set)', creative: '(not set)', adId: '', referrer: '',
      },
      eventCounts: { coast_fire_email_cta_opened: 1, coast_fire_email_trial_complete: 1 },
    });

    const report = buildBeachheadScorecard({
      current: [calculator, emailReturn],
      previous: [],
      ga4State: 'live',
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });

    expect(report.coastFireJourney[0].value).toBe(1);
    expect(report.leadCapture.coastFire.resultSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.rawResultsEmailedEvents.value).toBe(1);
    expect(report.leadCapture.coastFire.resultsEmailedSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.emailRequestExclusions).toEqual([]);
    expect(report.leadCapture.coastFire.captureRate.value).toBe(1);
    expect(report.leadCapture.coastFire.emailCtaOpenedSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.emailTrialCompletedSessions.value).toBe(1);
  });

  it('uses the post-instrumentation result cohort for the email capture rate', () => {
    const beforeTracking = session('coast-before-email-tracking', {
      sessionDate: '2026-09-11',
      acquisition: {
        source: 'google', medium: 'cpc', channel: 'Paid', campaign: 'coast_fire',
        landingPage: '/coast-fire-calculator', searchTerm: 'coast fire calculator',
        creative: 'calculator', adId: '1', referrer: '',
      },
      eventCounts: { coast_fire_calculated: 1 },
    });
    const afterTracking = session('coast-after-email-tracking', {
      sessionDate: '2026-09-12',
      acquisition: {
        source: 'google', medium: 'cpc', channel: 'Paid', campaign: 'coast_fire',
        landingPage: '/coast-fire-calculator', searchTerm: 'coast fire calculator',
        creative: 'email-results', adId: '2', referrer: '',
      },
      eventCounts: { coast_fire_calculated: 1, coast_fire_results_emailed: 1 },
      firstEventAt: { coast_fire_calculated: 1_000_000, coast_fire_results_emailed: 2_000_000 },
    });

    const report = buildBeachheadScorecard({
      current: [beforeTracking, afterTracking],
      previous: [],
      ga4State: 'live',
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });

    expect(report.coastFireJourney[0].value).toBe(2);
    expect(report.leadCapture.coastFire.resultSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.resultsEmailedSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.captureRate.value).toBe(1);
  });

  it('keeps direct-save accounts and handoffs out of email-return outcomes', () => {
    const direct = session('direct-save', { sessionDate: '2026-09-18', eventCounts: {
      coast_fire_page_cta_opened: 2, coast_fire_page_account_created: 1,
      coast_fire_page_trial_complete: 1, retirement_page_cta_opened: 1,
    } });
    const report = buildBeachheadScorecard({ current: [direct], previous: [],
      ga4State: 'live', funnelCoverageComplete: false, previousFunnelCoverageComplete: false, firstParty });
    expect(report.leadCapture.coastFire.pageCtaOpenedSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.pageAccountsCreatedSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.pageTrialCompletedSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.emailTrialCompletedSessions.value).toBe(0);
    expect(report.leadCapture.retirement.pageCtaOpenedSessions.value).toBe(1);
    expect(report.leadCapture.retirement.pageAccountsCreatedSessions.value).toBe(0);
  });

  it('reconciles a raw email event that traffic-quality filtering excludes', () => {
    const internalRequest = session('internal-email-request', {
      sessionDate: '2026-09-13',
      acquisition: {
        source: 'direct', medium: '(none)', channel: 'Direct', campaign: '(not set)',
        landingPage: '/coast-fire-calculator', searchTerm: '(not set)', creative: '(not set)', adId: '', referrer: '',
      },
      trafficQuality: 'internal',
      exclusionReasons: ['admin_page_session'],
      eventCounts: { coast_fire_calculated: 1, coast_fire_results_emailed: 1 },
      firstEventAt: { coast_fire_calculated: 1_000_000, coast_fire_results_emailed: 2_000_000 },
    });

    const report = buildBeachheadScorecard({
      current: [],
      previous: [],
      rawCurrent: [internalRequest],
      rawPrevious: [],
      ga4State: 'live',
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });

    expect(report.leadCapture.coastFire.rawResultsEmailedEvents.value).toBe(1);
    expect(report.leadCapture.coastFire.resultsEmailedSessions.value).toBe(0);
    expect(report.leadCapture.coastFire.emailRequestExclusions).toEqual([{
      reason: 'traffic_quality',
      label: 'Excluded as internal, developer, automated, or non-production traffic',
      sessions: 1,
    }]);
  });

  it('does not treat an explicit traffic-quality cohort as traffic-quality exclusions', () => {
    // Callers that honor an admin trafficQuality filter must pass the same
    // narrowed cohort as rawCurrent. Comparing a filtered current view to an
    // unfiltered raw population would mislabel omitted production sessions.
    const internalQualified = session('internal-qualified', {
      sessionDate: '2026-09-13',
      acquisition: {
        source: 'direct', medium: '(none)', channel: 'Direct', campaign: '(not set)',
        landingPage: '/coast-fire-calculator', searchTerm: '(not set)', creative: '(not set)', adId: '', referrer: '',
      },
      trafficQuality: 'internal',
      exclusionReasons: ['admin_page_session'],
      eventCounts: { coast_fire_calculated: 1, coast_fire_results_emailed: 1 },
      firstEventAt: { coast_fire_calculated: 1_000_000, coast_fire_results_emailed: 2_000_000 },
    });
    const productionOmittedByFilter = session('production-email', {
      sessionDate: '2026-09-13',
      acquisition: {
        source: 'google', medium: 'cpc', channel: 'Paid Search', campaign: 'coast',
        landingPage: '/coast-fire-calculator', searchTerm: '(not set)', creative: '(not set)', adId: '1', referrer: '',
      },
      trafficQuality: 'human',
      exclusionReasons: [],
      eventCounts: { coast_fire_calculated: 1, coast_fire_results_emailed: 1 },
      firstEventAt: { coast_fire_calculated: 1_000_000, coast_fire_results_emailed: 2_000_000 },
    });

    const report = buildBeachheadScorecard({
      current: [internalQualified],
      previous: [],
      rawCurrent: [internalQualified],
      rawPrevious: [],
      ga4State: 'live',
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });

    expect(report.leadCapture.coastFire.rawResultsEmailedEvents.value).toBe(1);
    expect(report.leadCapture.coastFire.resultsEmailedSessions.value).toBe(1);
    expect(report.leadCapture.coastFire.emailRequestExclusions).toEqual([]);

    const miswired = buildBeachheadScorecard({
      current: [internalQualified],
      previous: [],
      rawCurrent: [internalQualified, productionOmittedByFilter],
      rawPrevious: [],
      ga4State: 'live',
      funnelCoverageComplete: true,
      previousFunnelCoverageComplete: true,
      firstParty,
    });
    expect(miswired.leadCapture.coastFire.emailRequestExclusions).toEqual([{
      reason: 'traffic_quality',
      label: 'Excluded as internal, developer, automated, or non-production traffic',
      sessions: 1,
    }]);
  });

  it('surfaces the actual GA4 failure state instead of calling every outage collecting', () => {
    const report = buildBeachheadScorecard({
      current: [],
      previous: [],
      ga4State: 'needs_configuration',
      funnelCoverageComplete: false,
      previousFunnelCoverageComplete: false,
      firstParty,
    });

    expect(report.state).toBe('needs_configuration');
    expect(report.coastFireJourney.every(stage => stage.value === null)).toBe(true);
    expect(report.currentCalculatorBaseline.every(stage => stage.value === null)).toBe(true);
  });
});
