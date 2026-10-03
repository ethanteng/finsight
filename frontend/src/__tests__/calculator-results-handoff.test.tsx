/**
 * From a calculator answer into Ask Linc.
 *
 * Both public calculators compute a result and then hold it back. Giving an
 * address sends the visitor to signup with the run, where a password is all
 * that stands between them and seeing it as their account's first decision.
 * What matters here is that nothing restating the answer reaches the page —
 * not the figures, not the reading, not the signup handoff — that giving the
 * address hands the run to signup rather than revealing it, and that the page
 * shows the answer itself only when there is no run for an account to open.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CoastFireCalculator } from '@/components/marketing/CoastFireCalculator';
import { RetirementQuickPlan } from '@/components/marketing/RetirementQuickPlan';
import { leaveForSignup } from '@/lib/calculator-handover';
import { readCoastFireSignupContext } from '@/lib/coast-fire-signup-context';
import { CALCULATOR_EMAIL_STORAGE_KEY } from '@/lib/calculator-email-memory';

jest.mock('@/lib/calculator-handover', () => ({
  ...jest.requireActual('@/lib/calculator-handover'),
  leaveForSignup: jest.fn(),
}));

jest.mock('@/lib/dataLayer', () => ({
  pushCoastFireCalculated: jest.fn(),
  pushCoastFireResultsEmailed: jest.fn(),
  pushCalculatorRunLimitReached: jest.fn(),
  pushRetirementInteraction: jest.fn(),
  pushRetirementModelRun: jest.fn(),
  pushRetirementResultsEmailed: jest.fn(),
  pushStartFreeClick: jest.fn(),
}));

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

const REF = 'd'.repeat(48);
const READING = {
  headline: 'A reading.', paragraphs: ['A paragraph.'], watchOuts: [], model: 'test-model',
};

const posts: string[] = [];

function mockApi(planResult: unknown = null, emailBody: Record<string, unknown> = { message: 'sent', ref: REF }) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (!init?.method) {
      return Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) });
    }
    posts.push(String(url));
    if (String(url).includes('/interpretation')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => READING });
    }
    if (String(url).includes('/email-results')) {
      return Promise.resolve({ ok: true, json: async () => emailBody });
    }
    return Promise.resolve({ ok: true, json: async () => planResult });
  }) as unknown as typeof fetch;
}

function giveEmail(address = 'reader@example.com') {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: address } });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);
}

beforeEach(() => {
  posts.length = 0;
  window.sessionStorage.clear();
  jest.mocked(leaveForSignup).mockClear();
  Element.prototype.scrollIntoView = jest.fn();
  mockApi();
});

describe('Coast FIRE calculator', () => {
  // The default scenario's number, pinned by coast-fire.test.tsx.
  const COAST_FIRE_NUMBER = '$369,128';

  function calculate() {
    const edit = screen.queryByRole('button', { name: /edit inputs.*run again/i });
    if (edit) fireEvent.click(edit);
    const values: Record<string, string> = {
      'Your age today': '40',
      'Retirement age': '65',
      'Retirement savings today': '400000',
      'Annual spending in retirement': '80000',
      'Annual income available at retirement': '30000',
    };
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.submit(screen.getByRole('button', { name: /calculate my coast fire number/i }).closest('form')!);
  }

  it('holds the answer back until an address is given', () => {
    render(<CoastFireCalculator />);
    calculate();

    expect(screen.getByText('Your result is ready.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See my result in Ask Linc' })).toBeInTheDocument();
    // Not hidden: absent. A blurred copy of the real figure is one inspector away.
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
    expect(screen.queryByText(/you haven’t reached coast fire yet|you’ve reached coast fire/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your return assumption does most of the work/i)).not.toBeInTheDocument();
    // The reading restates the figures, so it is not even asked for.
    expect(posts.some((url) => url.includes('/interpretation'))).toBe(false);
  });

  /*
   * The answer opens in Ask Linc, so the address takes the visitor there with
   * the run rather than revealing it here.
   */
  it('hands the run to signup instead of revealing it', async () => {
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();

    await waitFor(() => expect(leaveForSignup).toHaveBeenCalled());
    expect(jest.mocked(leaveForSignup).mock.calls[0][0]).toContain('entry=results_page');
    expect(readCoastFireSignupContext()?.sourceToken).toBe(REF);
    expect(readCoastFireSignupContext()?.email).toBe('reader@example.com');
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
    expect(posts.some((url) => url.includes('/interpretation'))).toBe(false);
  });

  /*
   * Without a token there is no run to seed an account from, and sending them
   * to an empty one would be worse than showing the answer here.
   */
  it('shows the answer on the page only when no token comes back', async () => {
    mockApi(null, { message: 'sent' });
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();

    // The card, and the return comparison's own row for the chosen rate.
    expect((await screen.findAllByText(COAST_FIRE_NUMBER)).length).toBeGreaterThan(0);
    expect(await screen.findByText(READING.headline)).toBeInTheDocument();
    expect(leaveForSignup).not.toHaveBeenCalled();
  });

  /*
   * Giving an address once is not a tab-wide unlock any more: every answer is
   * meant to be seen in Ask Linc. The address is remembered so the next form
   * does not ask for it again.
   */
  it('holds the next run back too, with the address already filled in', async () => {
    mockApi(null, { message: 'sent' });
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();
    await screen.findAllByText(COAST_FIRE_NUMBER);

    calculate();

    expect(screen.getByText('Your result is ready.')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
    expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');
    expect(window.sessionStorage.getItem(CALCULATOR_EMAIL_STORAGE_KEY)).toBe('reader@example.com');
  });

  it('does not hand a locked run to signup through the page CTA', () => {
    render(<CoastFireCalculator />);
    calculate();

    fireEvent.click(screen.getByRole('link', { name: /stress-test my coast fire plan/i }));

    expect(readCoastFireSignupContext()).toBeNull();
  });
});

describe('retirement calculator', () => {
  const INPUTS = {
    currentAge: 52, retirementAge: 60, investableAssets: 1_200_000, annualSpending: 95_000,
    annualContributions: 35_000, socialSecurityAnnual: 36_000, socialSecurityStartAge: 67,
    lifeExpectancy: 95, allocation: 'balanced',
  };
  const PLAN = {
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
  const RATES = { ...PLAN, mode: 'rates', primary: null, missing: ['investableAssets'] };

  async function runTheModel() {
    const edit = screen.queryByRole('button', { name: /edit inputs.*run again/i });
    if (edit) fireEvent.click(edit);
    fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);
    await waitFor(() => expect(screen.queryByRole('button', { name: /run the model/i })).not.toBeInTheDocument());
  }

  function renderPage() {
    return render(<RetirementQuickPlan headline="Can I retire at 60?" initialRetirementAge={60} />);
  }

  it('holds the verdict back until an address is given', async () => {
    mockApi(PLAN);
    renderPage();
    await runTheModel();

    expect(await screen.findByText('Your result is ready.')).toBeInTheDocument();
    expect(screen.queryByText(/retiring at 60 worked in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/how much you could spend each year/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the two levers these numbers can pull/i)).not.toBeInTheDocument();
    expect(posts.some((url) => url.includes('/interpretation'))).toBe(false);
    // The page's own CTA does not carry the locked run into signup either.
    expect(screen.getByRole('link', { name: 'Build my retirement plan' })).toBeInTheDocument();
  });

  it('hands the run to signup instead of revealing it', async () => {
    mockApi(PLAN);
    renderPage();
    await runTheModel();
    await screen.findByText('Your result is ready.');
    giveEmail();

    await waitFor(() => expect(leaveForSignup).toHaveBeenCalled());
    expect(jest.mocked(leaveForSignup).mock.calls[0][0]).toContain('/getstarted?source=retirement-calculator');
    expect(screen.queryByText(/retiring at 60 worked in/i)).not.toBeInTheDocument();
    expect(posts.some((url) => url.includes('/interpretation'))).toBe(false);
  });

  it('shows the verdict on the page only when no token comes back', async () => {
    mockApi(PLAN, { message: 'sent' });
    renderPage();
    await runTheModel();
    await screen.findByText('Your result is ready.');
    giveEmail();

    expect(await screen.findByText(/retiring at 60 worked in/i)).toBeInTheDocument();
    expect(await screen.findByText(READING.headline)).toBeInTheDocument();
    expect(screen.getByText(/so here is your result/i)).toBeInTheDocument();
    expect(leaveForSignup).not.toHaveBeenCalled();
  });

  /*
   * A rates answer says nothing about the visitor's own plan and has no run
   * to save, so there is nothing to hold back.
   */
  it('does not gate a rates-only answer', async () => {
    mockApi(RATES);
    renderPage();
    await runTheModel();

    expect(await screen.findByText(/what this mix sustained/i)).toBeInTheDocument();
    expect(screen.queryByText('Your result is ready.')).not.toBeInTheDocument();
  });

  it('fills in the address the other calculator was given', async () => {
    window.sessionStorage.setItem(CALCULATOR_EMAIL_STORAGE_KEY, 'reader@example.com');
    mockApi(PLAN);
    renderPage();
    await runTheModel();

    expect(await screen.findByText('Your result is ready.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');
  });
});
