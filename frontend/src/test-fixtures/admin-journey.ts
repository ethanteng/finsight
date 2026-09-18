import type { JourneyData } from '@/components/admin/VisitorJourney';

export const journeyFixture: JourneyData = {
  state: 'available', ratesAvailable: true,
  period: { start: '2026-09-11', end: '2026-09-17' },
  note: 'Fixture: ordered same-session steps; later email returns are separate.',
  rows: [
    { id: 'retirement', label: 'Retirement calculator', counts: [100, 50, 20, 16, 12, 10] },
    { id: 'coast_fire', label: 'Coast FIRE calculator', counts: [80, 40, 16, 12, 8, 6] },
    { id: 'signup', label: 'All signup visits', counts: [40, 30, 25, 22, 18] },
    { id: 'signup_retirement', label: 'Retirement · all signup routes', counts: [20, 16, 14, 12, 10] },
    { id: 'signup_retirement_results_page', label: 'Retirement · Save results', counts: [12, 10, 8, 8, 6] },
    { id: 'signup_retirement_results_email', label: 'Retirement · Email return', counts: [4, 4, 3, 3, 2] },
  ].flatMap(({ id, label, counts }) => ['all', 'mobile', 'desktop'].map(device => {
    const values = counts.map(value => device === 'all' ? value : device === 'mobile' ? Math.ceil(value * .6) : Math.floor(value * .4));
    const labels = id.startsWith('signup') ? ['Reached signup', 'Started the form', 'Submitted the form', 'Created an account', 'Continued to the app']
      : ['Landed on the calculator', 'Got a result', 'Saved results or chose to sign up', 'Reached signup', 'Created an account', 'Continued to the app'];
    const ids = id.startsWith('signup') ? ['trial_signup_viewed', 'trial_signup_started', 'trial_signup_submit', 'sign_up', 'trial_signup_completed']
      : ['landed', 'result', 'continue', 'signup', 'account', 'handoff'];
    const mainIndices = id.startsWith('signup') ? [0, 3, 4] : [0, 1, 2, 3, 4, 5];
    const steps: JourneyData['rows'][number]['steps'] = mainIndices.map((valueIndex, index) => ({ id: ids[valueIndex], label: labels[valueIndex], sessions: values[valueIndex],
      continuedRate: index && values[mainIndices[index - 1]] ? values[valueIndex] / values[mainIndices[index - 1]] : null,
      droppedSessions: index && values[mainIndices[index - 1]] ? values[mainIndices[index - 1]] - values[valueIndex] : null,
      dropoffRate: index && values[mainIndices[index - 1]] ? (values[mainIndices[index - 1]] - values[valueIndex]) / values[mainIndices[index - 1]] : null,
    }));
    {
      const formCounts = id.startsWith('signup') ? values.slice(0, 4)
        : [values[3], Math.ceil((values[3] + values[4]) / 2), values[4], values[4]];
      const accountStep = steps[id.startsWith('signup') ? 1 : 4];
      accountStep.breakdownTrackingGapSessions = 0;
      accountStep.breakdown = formCounts.map((sessions, index) => ({
        id: ['trial_signup_viewed', 'trial_signup_started', 'trial_signup_submit', 'sign_up'][index],
        label: ['Reached signup', 'Started the form', 'Submitted the form', 'Created an account'][index], sessions,
        continuedRate: index && formCounts[index - 1] ? sessions / formCounts[index - 1] : null,
        droppedSessions: index && formCounts[index - 1] ? formCounts[index - 1] - sessions : null,
        dropoffRate: index && formCounts[index - 1] ? (formCounts[index - 1] - sessions) / formCounts[index - 1] : null,
      }));
    }
    return { id, label, device, steps };
  })),
};

const metric = { value: null, previous: null, unit: 'percent', source: 'Preview' };
const lead = {
  state: 'live', periodStart: '2026-09-11', periodEnd: '2026-09-17', requests: 20, emailsSent: 19,
  uniqueEmails: 18, mailerliteSynced: 18, continuedToSignup: 16, pageHandoffsPrepared: 17,
  matchedAccounts: 12, verifiedMatchedAccounts: 10, savedResultAccounts: 12,
  attributionCaptured: 18, paidAttributionCaptured: 5, deliveryRate: .95, continuationRate: .8,
  accountMatchRate: 12 / 18, attributionRate: .9, note: 'First-party records; not a session funnel.',
};
const capture = {
  resultSessions: metric, rawResultsEmailedEvents: metric, resultsEmailedSessions: metric,
  emailRequestExclusions: [], captureRate: metric, emailCtaOpenedSessions: metric,
  emailTrialCompletedSessions: metric, firstParty: lead, pendingFirstParty: lead,
};
export const marketingFixture = {
  visitorJourneys: journeyFixture,
  period: { ...journeyFixture.period, previousStart: '2026-09-04', previousEnd: '2026-09-10' },
  coverage: { eventTrackingStartedAt: '2026-09-10', fullyObservedThrough: '2026-09-17', usesFallbackSnapshot: false },
  firstParty: { accountsCreated: 20, createdAccountsWithFinancialConnection: 4, createdAccountsWithConversation: 3, createdAccountsCurrentlyPaid: 0 },
  beachhead: {
    state: 'collecting', cohortLabel: 'Coast FIRE', cohortDefinition: 'Explicit Coast FIRE activity.',
    coastFireJourney: [], currentCalculatorBaseline: [], leadCapture: { retirement: capture, coastFire: capture },
    downstream: { financialConnectionRate: metric, activationRate: metric, paidRate: metric }, evidenceGaps: [],
  },
  diagnostics: [{ id: 'ga4', name: 'GA4', state: 'live', freshness: '2026-09-17', detail: 'Local test fixture, not production data.' }],
  warnings: [],
};

export const retirementFixture = {
  generatedAt: '2026-09-17T20:00:00Z', windowDays: 28, truncated: false,
  totals: { runs: 100, answeredWithVerdict: 80, answeredWithRates: 10, rejected: 10, answerRate: .9, cachedShare: .2, medianDurationMs: 150 },
  rejectionsByField: [{ label: 'currentAge', count: 10, share: 1 }], blanksByField: [], assumptionsByField: [],
  distributions: { currentAge: [], retirementAge: [], investableAssets: [], annualSpending: [], socialSecurityAnnual: [], allocation: [], survivalRate: [] },
  daily: [{ date: '2026-09-17', runs: 100, rejected: 10, answerRate: .9 }],
  leadCapture: lead,
};
