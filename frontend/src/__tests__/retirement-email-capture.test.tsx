/**
 * Emailing a retirement model run.
 *
 * The counterpart to the Coast FIRE capture tests. What matters here is that
 * the form only appears once there is a verdict to send, that it posts the six
 * numbers rather than the figures computed from them, and that it never hands
 * the typed address to analytics or session replay.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RetirementQuickPlan } from '@/components/marketing/RetirementQuickPlan';
import { pushRetirementResultsEmailed } from '@/lib/dataLayer';

jest.mock('@/lib/dataLayer', () => ({
  pushRetirementInteraction: jest.fn(),
  pushRetirementModelRun: jest.fn(),
  pushRetirementResultsEmailed: jest.fn(),
  pushStartFreeClick: jest.fn(),
}));

// Recharts needs a ResizeObserver jsdom does not provide, and these cases are
// about the form beside the chart rather than the chart.
jest.mock('recharts', () => ({
  BarChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Bar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  LabelList: () => null,
  ReferenceLine: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const emailed = jest.mocked(pushRetirementResultsEmailed);

const INPUTS = {
  currentAge: 52, retirementAge: 60, investableAssets: 1_200_000, annualSpending: 95_000,
  annualContributions: 35_000, socialSecurityAnnual: 36_000, socialSecurityStartAge: 67,
  lifeExpectancy: 95, allocation: 'balanced',
};

const BASE_RESULT = {
  mode: 'plan',
  assumed: [],
  missing: [],
  inputs: INPUTS,
  allocation: { id: 'balanced', label: 'Balanced', description: 'Example', equityPercent: 60 },
  history: {
    firstMonth: '1926-07', lastMonth: '2025-12', firstStartMonth: '1926-07',
    lastStartMonth: '1995-12', horizonYears: 43, sequencesTested: 800,
  },
  primary: {
    id: 'as-entered', label: 'Retire at 60', change: null, retirementAge: 60,
    annualSpending: 95_000, survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736,
    projectedPortfolioAtRetirement: 2_100_000, firstYearPortfolioWithdrawal: 95_000,
    firstYearWithdrawalRate: 0.045, depletionYears: null, primaryObservation: 'Example',
    tradeoffs: { upside: 'Example', downside: 'Example' },
    characteristics: {
      growthPotential: 'moderate', drawdownResistance: 'moderate',
      withdrawalFragility: 'low', inflationProtection: 'moderate',
    },
  },
  alternatives: [],
  sustainableSpending: {
    p10: 31_000, p25: 36_000, p50: 40_000, p75: 47_000, p90: 55_000,
    solverFloorRate: 0.02, solverCeilingRate: 0.08,
  },
  sustainableSpendingRates: {
    p10: 0.031, p25: 0.036, p50: 0.04, p75: 0.047, p90: 0.055,
    solverFloorRate: 0.02, solverCeilingRate: 0.08,
  },
  assumptions: [],
  limitations: [],
};

/** No portfolio given, so no verdict, so nothing worth putting in an inbox. */
const RATES_RESULT = { ...BASE_RESULT, mode: 'rates', primary: null, missing: ['investableAssets'] };

const posts: Array<{ url: string; body: Record<string, unknown> }> = [];

/**
 * Three endpoints answer here: the form's allocation options on mount, the
 * model run, and the results email. Only the last two are POSTs.
 */
function mockApi(planResult: unknown, emailResponse: Partial<Response> = { ok: true }) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (!init?.method) {
      return Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) });
    }
    posts.push({ url: String(url), body: JSON.parse(String(init.body)) });
    if (String(url).includes('/email-results')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ message: 'sent' }),
        ...emailResponse,
      });
    }
    return Promise.resolve({ ok: true, json: async () => planResult });
  }) as unknown as typeof fetch;
}

function runTheModel() {
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);
}

beforeEach(() => {
  posts.length = 0;
  emailed.mockClear();
  window.sessionStorage.clear();
  Element.prototype.scrollIntoView = jest.fn();
  mockApi(BASE_RESULT);
});

function renderPage() {
  return render(<RetirementQuickPlan headline="Can I retire at 60?" initialRetirementAge={60} />);
}

it('asks for an address only once a plan has produced a verdict', async () => {
  renderPage();
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();

  runTheModel();

  expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Email me my retirement results' })).toBeInTheDocument();
});

/*
 * Placement is the point of where this sits: someone who reads their verdict
 * and stops should still be offered a copy of it. The capture belongs with the
 * answer, above the jump link, and both inside the results block — not further
 * down past two charts.
 */
it('puts the capture with the answer, above the shortcut to the connected example', async () => {
  renderPage();
  runTheModel();

  const field = await screen.findByLabelText('Email address');
  const results = field.closest('section')!;
  const jump = screen.getByRole('link', { name: /see what changes with your actual holdings/i });

  // Same block as the verdict, so it cannot drift back down the page.
  expect(results).toHaveTextContent(/retiring at 60 worked in/i);
  expect(results).toContainElement(jump);
  // Capture first, shortcut second.
  expect(field.compareDocumentPosition(jump) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

/*
 * A rates run has no survival figure — the model will not invent a portfolio
 * or a spending level — so there is nothing to send and no address to collect.
 */
it('stays away when the run produced no verdict to send', async () => {
  mockApi(RATES_RESULT);
  renderPage();

  runTheModel();

  await screen.findByText(/what this mix sustained/i);
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
});

it('posts the plan inputs and never the figures computed from them', async () => {
  renderPage();
  runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: ' Reader@Example.com ' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  await screen.findByText(/on their way/i);
  const send = posts.find((post) => post.url.includes('/email-results'))!;
  expect(send.body).toEqual({ email: 'Reader@Example.com', ...INPUTS });
  // The server re-runs the model, so a verdict in the body would only be an
  // opportunity to disagree with it.
  expect(send.body).not.toHaveProperty('survivalRate');
});

it('reports the conversion as a band, never as the address or the exact rate', async () => {
  renderPage();
  runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  await screen.findByText(/on their way/i);
  expect(emailed).toHaveBeenCalledTimes(1);
  expect(emailed).toHaveBeenCalledWith(0.92);
});

it('surfaces a refusal and leaves the form ready to retry', async () => {
  mockApi(BASE_RESULT, {
    ok: false,
    json: async () => ({ error: 'Enter a valid email address.' }),
  });
  renderPage();
  runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
  expect(screen.getByRole('button', { name: 'Email me my retirement results' })).toBeEnabled();
  expect(emailed).not.toHaveBeenCalled();
});

it('keeps the typed address out of Contentsquare recordings', async () => {
  renderPage();
  runTheModel();

  expect(await screen.findByLabelText('Email address')).toHaveAttribute('data-cs-mask');
});

/*
 * The confirmation belongs to the plan it was sent for. Someone who emails one
 * run, changes a number and re-runs must not see the new answer claiming its
 * figures were already sent.
 */
it('resets the capture when a new plan is run', async () => {
  renderPage();
  runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);
  await screen.findByText(/on their way/i);

  mockApi({
    ...BASE_RESULT,
    inputs: { ...INPUTS, retirementAge: 62 },
    primary: { ...BASE_RESULT.primary, retirementAge: 62, survivalRate: 0.97 },
  });
  runTheModel();

  await waitFor(() => expect(screen.queryByText(/on their way/i)).not.toBeInTheDocument());
  expect(screen.getByLabelText('Email address')).toHaveValue('');
});
