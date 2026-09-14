import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MarketingDashboardPage from '@/app/admin/marketing/page';

jest.mock('@/components/PageMeta', () => function MockPageMeta() { return null; });
jest.mock('@/components/authenticated/AuthenticatedPageHeader', () => function MockAuthenticatedPageHeader() { return <div>Admin header</div>; });
jest.mock('@/lib/internal-analytics', () => ({ markInternalAnalyticsBrowser: jest.fn() }));

const unavailableJourney = [
  ['qualified_visit', 'Qualified visits'],
  ['calculator_result', 'Result shown'],
  ['plan_cta', 'Actual-plan CTA'],
  ['trial_complete', 'Trial completed'],
].map(([id, label]) => ({
  id,
  label,
  value: null,
  previous: null,
  conversionRate: null,
  previousConversionRate: null,
  note: 'Unavailable in this fixture.',
}));

const emptyLeadCapture = {
  resultSessions: { value: null, previous: null, unit: 'count', source: 'Collecting' },
  rawResultsEmailedEvents: { value: 0, previous: 0, unit: 'count', source: 'GA4' },
  resultsEmailedSessions: { value: null, previous: null, unit: 'count', source: 'Collecting' },
  emailRequestExclusions: [],
  captureRate: { value: null, previous: null, unit: 'percent', source: 'Collecting' },
  emailCtaOpenedSessions: { value: null, previous: null, unit: 'count', source: 'Collecting' },
  emailTrialCompletedSessions: { value: null, previous: null, unit: 'count', source: 'Collecting' },
  firstParty: {
    state: 'live', periodStart: '2026-08-12', periodEnd: '2026-09-08',
    requests: 0, emailsSent: 0, uniqueEmails: 0, mailerliteSynced: 0,
    continuedToSignup: 0, matchedAccounts: 0, attributionCaptured: 0,
    paidAttributionCaptured: 0, deliveryRate: null, continuationRate: null,
    accountMatchRate: null, attributionRate: null, note: 'Live first-party lead records.',
  },
  pendingFirstParty: {
    state: 'live', periodStart: '2026-09-09', periodEnd: '2026-09-12',
    requests: 0, emailsSent: 0, uniqueEmails: 0, mailerliteSynced: 0,
    continuedToSignup: 0, matchedAccounts: 0, attributionCaptured: 0,
    paidAttributionCaptured: 0, deliveryRate: null, continuationRate: null,
    accountMatchRate: null, attributionRate: null, note: 'Pending first-party records.',
  },
};

describe('marketing scorecard data states', () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it('shows immediate calculator health and the real GA4 configuration failure', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test';
    window.localStorage.setItem('auth_token', 'test-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        period: {
          start: '2026-08-12',
          end: '2026-09-08',
          previousStart: '2026-07-15',
          previousEnd: '2026-08-11',
        },
        coverage: {
          eventTrackingStartedAt: null,
          fullyObservedThrough: null,
          usesFallbackSnapshot: true,
        },
        firstParty: {
          accountsCreated: 0,
          createdAccountsWithFinancialConnection: 0,
          createdAccountsWithConversation: 0,
          createdAccountsCurrentlyPaid: 0,
        },
        retirementCalculatorHealth: {
          state: 'live',
          windowDays: 28,
          submissions: 70,
          answered: 67,
          rejected: 3,
          answerRate: 67 / 70,
          note: 'Live first-party calculator-run records. These totals measure product reliability, not GA4 sessions or marketing attribution.',
        },
        beachhead: {
          state: 'needs_configuration',
          cohortLabel: 'Coast FIRE planners',
          cohortDefinition: 'Explicit Coast FIRE activity.',
          coastFireJourney: unavailableJourney,
          currentCalculatorBaseline: unavailableJourney,
          leadCapture: {
            coastFire: emptyLeadCapture,
            retirement: emptyLeadCapture,
          },
          downstream: {
            financialConnectionRate: { value: null, previous: null, unit: 'percent', source: 'First-party accounts' },
            activationRate: { value: null, previous: null, unit: 'percent', source: 'First-party accounts' },
            paidRate: { value: null, previous: null, unit: 'percent', source: 'First-party accounts' },
          },
          evidenceGaps: [],
        },
        diagnostics: [{
          id: 'ga4',
          name: 'GA4 + BigQuery',
          state: 'needs_configuration',
          freshness: null,
          detail: 'Add a read-only BigQuery service account to the backend environment.',
        }],
        warnings: [],
      }),
    }) as jest.Mock;

    render(<MarketingDashboardPage />);

    expect(await screen.findByText('First-party product health · last 28 days')).toBeInTheDocument();
    expect(screen.getByText('95.7%')).toBeInTheDocument();
    expect(screen.getByText('GA4 reporting needs configuration.')).toBeInTheDocument();
    expect(screen.getAllByText('Add a read-only BigQuery service account to the backend environment.')).toHaveLength(2);
    expect(screen.getAllByText(/GA4 and first-party comparison rows both cover Aug 12 through Sep 8/)).toHaveLength(2);
    expect(screen.getAllByText('Ran calculator')).toHaveLength(2);
    expect(screen.getAllByText('Emailed results')).toHaveLength(2);
    expect(screen.getAllByText('Clicked email CTA')).toHaveLength(2);
    expect(screen.getAllByText('Completed trial signup')).toHaveLength(2);
    expect(screen.getAllByText('Observed in this window; the email may have been sent earlier')).toHaveLength(2);
    expect(screen.getAllByText('Email-attributed trial completions observed in this window')).toHaveLength(2);
    expect(screen.queryByText('Conversion from emailed results unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Conversion from email CTA clicks unavailable')).not.toBeInTheDocument();
    expect(screen.getAllByText('Show measurement details')).toHaveLength(2);
    expect(screen.getAllByText('GA4 email events observed')).toHaveLength(2);
    const liveIndicators = screen.getAllByLabelText(/Live data, queried from the first-party database/);
    const delayedIndicators = screen.getAllByLabelText(/Delayed GA4 data from the daily export/);
    expect(liveIndicators.length).toBeGreaterThan(0);
    expect(delayedIndicators.length).toBeGreaterThan(0);
    expect(liveIndicators[0]).toHaveAttribute('title', expect.stringContaining('first-party database'));
    expect(delayedIndicators[0]).toHaveAttribute('title', expect.stringContaining('daily export'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/admin/marketing?days=28&compare=true',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    ));
  });
});
