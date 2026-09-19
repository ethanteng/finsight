/**
 * The model's reading of a run, on the page.
 *
 * Three things are worth holding down here, and none of them is the prose.
 * The panel must not delay the deterministic answer, it must disappear rather
 * than apologise when no reading was produced, and it must ask about the plan
 * the visitor submitted rather than the normalized one — a run with a blank
 * box is simulated against a notional portfolio, and posting that back would
 * ask for a reading of money nobody has.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RetirementQuickPlan } from '@/components/marketing/RetirementQuickPlan';

jest.mock('@/lib/dataLayer', () => ({
  pushRetirementInteraction: jest.fn(),
  pushRetirementModelRun: jest.fn(),
}));

// Recharts needs a ResizeObserver jsdom does not provide, and none of this is
// about the chart.
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

const PLAN_RESULT = {
  mode: 'plan',
  assumed: [],
  missing: [],
  inputs: {
    currentAge: 52, retirementAge: 60, investableAssets: 1_200_000, annualSpending: 95_000,
    annualContributions: 0, socialSecurityAnnual: 0, socialSecurityStartAge: 67,
    lifeExpectancy: 95, allocation: 'balanced',
  },
  allocation: { id: 'balanced', label: 'Balanced', description: 'Example', equityPercent: 60 },
  history: {
    firstMonth: '1926-07', lastMonth: '2025-12', firstStartMonth: '1926-07',
    lastStartMonth: '1995-12', horizonYears: 43, sequencesTested: 834,
  },
  primary: {
    id: 'as-entered', label: 'Retire at 60', change: null, retirementAge: 60,
    annualSpending: 95_000, survivalRate: 0.92, sequencesTested: 800, sequencesSurvived: 736,
    projectedPortfolioAtRetirement: 1_000_000, firstYearPortfolioWithdrawal: 95_000,
    firstYearWithdrawalRate: 0.04, depletionYears: null, primaryObservation: 'Example',
    tradeoffs: { upside: 'Example', downside: 'Example' },
    characteristics: {
      growthPotential: 'Example', drawdownResistance: 'Example',
      withdrawalFragility: 'Example', inflationProtection: 'Example',
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

const READING = {
  headline: 'Your money lasted in 92% of the retirements we could test.',
  paragraphs: ['That is 736 of the 800 stretches of market history long enough to test.'],
  watchOuts: ['You claim Social Security at 67, seven years after you stop working.'],
  model: 'test-model',
};

/**
 * Route each endpoint separately so a case can answer the interpretation
 * differently from the run — which is the whole point of the split.
 */
function mockApi(interpretation: () => Promise<Response>) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (!init?.method) {
      return Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) });
    }
    if (String(url).includes('/interpretation')) return interpretation();
    return Promise.resolve({ ok: true, status: 200, json: async () => PLAN_RESULT });
  });
}

const reading = () =>
  Promise.resolve({ ok: true, status: 200, json: async () => READING } as unknown as Response);
const dropped = () => Promise.resolve({ ok: true, status: 204 } as unknown as Response);

function renderPage() {
  return render(<RetirementQuickPlan headline="Can I retire at 60?" initialRetirementAge={60} />);
}

function run() {
  fireEvent.change(screen.getByLabelText(/current age/i), { target: { value: '52' } });
  fireEvent.change(screen.getByLabelText(/investment assets today/i), { target: { value: '1200000' } });
  fireEvent.change(screen.getByLabelText(/annual spending in retirement/i), { target: { value: '95000' } });
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);
}

beforeEach(() => {
  window.sessionStorage.clear();
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ allocations: [] }) });
});

it('renders the reading under the verdict', async () => {
  mockApi(reading);
  renderPage();
  run();

  expect(await screen.findByText(READING.headline)).toBeInTheDocument();
  for (const paragraph of READING.paragraphs) expect(screen.getByText(paragraph)).toBeVisible();
  expect(screen.queryByText(/Read Linc’s full answer/)).not.toBeInTheDocument();
  expect(screen.getByText(READING.watchOuts[0])).toBeVisible();
});

/*
 * The chevrons under the verdict point here. The panel is the one section on
 * the page that may not render at all, so the link and the target have to be
 * decided by the same condition — a gesture inviting a scroll to a section
 * that was dropped is worse than no gesture.
 */
it('shows the reading together with the result without a jump link', async () => {
  mockApi(reading);
  const { container } = renderPage();
  run();

  await screen.findByText(READING.headline);

  const view = container.querySelector('.calculator-result-grid');
  expect(view).toContainElement(screen.getByText(READING.headline));
  expect(view).toContainElement(container.querySelector('.qp-results'));
  expect(container.querySelector('.qp-jump')).toBeNull();
  expect(container.querySelector('#retirement-inputs')).not.toBeVisible();
});

/*
 * The verdict is the page's answer and arrives first. A reading that never
 * came is the ordinary case for a rate limit or a provider blip, and it must
 * not read as a broken calculator.
 */
it('shows the verdict without waiting, and shows nothing when no reading comes', async () => {
  mockApi(dropped);
  renderPage();
  run();

  // The deterministic answer is on the page regardless.
  expect(await screen.findByText(/retirements in market history/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.queryByText(/reading your result/i)).not.toBeInTheDocument();
  });
  expect(screen.queryByText(/what this result means/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  // And no chevrons, since there is nothing below to scroll to.
  expect(document.querySelector('.qp-jump')).toBeNull();
});

it('leaves the page intact when the interpretation request fails outright', async () => {
  mockApi(() => Promise.reject(new Error('offline')));
  renderPage();
  run();

  expect(await screen.findByText(/retirements in market history/i)).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText(/what this result means/i)).not.toBeInTheDocument();
  });
});

/*
 * `result.inputs` carries a notional portfolio for any box left blank. Asking
 * for a reading of those would turn a rates answer into a verdict about a
 * figure the visitor never entered.
 */
it('asks about the plan as submitted, not the normalized one', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (!init?.method) {
      return Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) });
    }
    if (String(url).includes('/interpretation')) {
      bodies.push(JSON.parse(String(init.body)));
      return reading();
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => PLAN_RESULT });
  });

  renderPage();
  fireEvent.change(screen.getByLabelText(/current age/i), { target: { value: '52' } });
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);

  await waitFor(() => expect(bodies).toHaveLength(1));
  // The blanks stay blank. PLAN_RESULT.inputs names 1,200,000 and 95,000;
  // neither was typed, and neither may be asked about.
  expect(bodies[0]).not.toHaveProperty('investableAssets');
  expect(bodies[0]).not.toHaveProperty('annualSpending');
  expect(bodies[0]).toMatchObject({ currentAge: 52 });
});
