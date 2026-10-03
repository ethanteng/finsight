/**
 * From a calculator answer into Ask Linc.
 *
 * Neither calculator shows its answer on its own page, in any case: the run
 * opens in Ask Linc as a decision in the visitor's account. What matters here
 * is that nothing restating the answer reaches the page — not the figures, not
 * the reading, not the page CTA — and that the address takes the run to the
 * right door:
 *
 * - a visitor already signed in: attached to that account, then `/app`;
 * - an address with an account: sign-in, which attaches it;
 * - anyone else: signup, where a password opens it as the first decision.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CoastFireCalculator } from '@/components/marketing/CoastFireCalculator';
import { RetirementQuickPlan } from '@/components/marketing/RetirementQuickPlan';
import { leaveForSignup } from '@/lib/calculator-handover';
import { readCoastFireSignupContext } from '@/lib/coast-fire-signup-context';
import { readRetirementSignupContext } from '@/lib/retirement-signup-context';
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
  LabelList: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

const REF = 'd'.repeat(48);
const SESSION = 'session-token';

interface Api {
  plan?: unknown;
  /** What `email-results` answers. */
  send?: Record<string, unknown>;
  /** Whether `POST /auth/calculator-lead` attaches. */
  attached?: boolean;
  /** The signed-in account's address, for `GET /auth/verify`. */
  signedInAs?: string;
}

const calls: Array<{ url: string; init?: RequestInit }> = [];

function mockApi({ plan = null, send = { message: 'sent', ref: REF }, attached = true, signedInAs }: Api = {}) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/auth/verify')) {
      return Promise.resolve(signedInAs
        ? { ok: true, json: async () => ({ user: { email: signedInAs } }) }
        : { ok: false, json: async () => ({}) });
    }
    if (String(url).includes('/auth/calculator-lead')) {
      return Promise.resolve({ ok: true, json: async () => ({ attached }) });
    }
    if (!init?.method) {
      return Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) });
    }
    if (String(url).includes('/email-results')) {
      return Promise.resolve({ ok: true, json: async () => send });
    }
    return Promise.resolve({ ok: true, json: async () => plan });
  }) as unknown as typeof fetch;
}

function requested(fragment: string): boolean {
  return calls.some(({ url }) => url.includes(fragment));
}

function giveEmail(address = 'reader@example.com') {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: address } });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);
}

async function destination(): Promise<string> {
  await waitFor(() => expect(leaveForSignup).toHaveBeenCalled());
  return jest.mocked(leaveForSignup).mock.calls[0][0];
}

beforeEach(() => {
  calls.length = 0;
  window.sessionStorage.clear();
  window.localStorage.clear();
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

  it('holds the answer back for Ask Linc', () => {
    render(<CoastFireCalculator />);
    calculate();

    expect(screen.getByText('Your result is ready.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See my result in Ask Linc' })).toBeInTheDocument();
    // Not hidden: absent. A blurred copy of the real figure is one inspector away.
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
    expect(screen.queryByText(/you haven’t reached coast fire yet|you’ve reached coast fire/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your return assumption does most of the work/i)).not.toBeInTheDocument();
    expect(requested('/interpretation')).toBe(false);
  });

  it('sends a new address to signup with the run', async () => {
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();

    const href = await destination();
    expect(href).toContain('/getstarted?source=coast-fire-calculator');
    expect(href).toContain('entry=results_page');
    expect(readCoastFireSignupContext()?.sourceToken).toBe(REF);
    expect(readCoastFireSignupContext()?.email).toBe('reader@example.com');
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
  });

  /*
   * An address with an account cannot register. Sign-in finds the run in the
   * stored context and attaches it, so the answer still opens in Ask Linc.
   */
  it('sends an existing account to sign in with the run', async () => {
    mockApi({ send: { message: 'sent', ref: REF, existingAccount: true } });
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();

    expect(await destination()).toBe('/login?source=coast-fire-calculator');
    expect(readCoastFireSignupContext()?.sourceToken).toBe(REF);
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
  });

  it('attaches the run for a visitor already signed in and opens it in the app', async () => {
    window.localStorage.setItem('auth_token', SESSION);
    mockApi({ send: { message: 'sent', ref: REF, existingAccount: true }, signedInAs: 'reader@example.com' });
    render(<CoastFireCalculator />);
    calculate();
    // The session's own address, so the run attaches to that account.
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com'));
    fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

    expect(await destination()).toBe('/app');
    const attach = calls.find(({ url }) => url.includes('/auth/calculator-lead'))!;
    expect((attach.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${SESSION}`);
    expect(JSON.parse(String(attach.init?.body))).toEqual({ calculatorRef: REF });
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
  });

  /*
   * A session whose account the lead does not name (they typed some other
   * address) attaches nothing, so the run follows the address they typed —
   * still into Ask Linc, never onto this page.
   */
  it('follows the typed address when a session cannot take the run', async () => {
    window.localStorage.setItem('auth_token', SESSION);
    mockApi({ attached: false, signedInAs: 'someone-else@example.com' });
    render(<CoastFireCalculator />);
    calculate();
    giveEmail('reader@example.com');

    expect(await destination()).toContain('/getstarted?source=coast-fire-calculator');
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
  });

  /* Nothing stored is nothing any account could open: an error to retry. */
  it('asks for a retry, and shows no answer, when nothing was stored', async () => {
    mockApi({ send: { message: 'sent', ref: null } });
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save your result/i);
    expect(document.body).not.toHaveTextContent(COAST_FIRE_NUMBER);
    expect(leaveForSignup).not.toHaveBeenCalled();
  });

  /*
   * Every run goes to Ask Linc, including a second in the same tab. The
   * address is remembered so the next form does not ask for it again.
   */
  it('holds the next run back too, with the address already filled in', async () => {
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();
    await destination();

    calculate();

    expect(screen.getByText('Your result is ready.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');
    expect(window.sessionStorage.getItem(CALCULATOR_EMAIL_STORAGE_KEY)).toBe('reader@example.com');
  });

  it('does not hand a run to signup through the page CTA', () => {
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

  it('holds the verdict back for Ask Linc', async () => {
    mockApi({ plan: PLAN });
    renderPage();
    await runTheModel();

    expect(await screen.findByText('Your result is ready.')).toBeInTheDocument();
    expect(screen.queryByText(/retiring at 60 worked in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/how much you could spend each year/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the two levers these numbers can pull/i)).not.toBeInTheDocument();
    expect(requested('/interpretation')).toBe(false);
    // The page's own CTA does not carry the run into signup either.
    expect(screen.getByRole('link', { name: 'Build my retirement plan' })).toBeInTheDocument();
  });

  it('sends a new address to signup with the run', async () => {
    mockApi({ plan: PLAN });
    renderPage();
    await runTheModel();
    await screen.findByText('Your result is ready.');
    giveEmail();

    expect(await destination()).toContain('/getstarted?source=retirement-calculator');
    expect(readRetirementSignupContext()?.sourceToken).toBe(REF);
    expect(screen.queryByText(/retiring at 60 worked in/i)).not.toBeInTheDocument();
  });

  it('sends an existing account to sign in with the run', async () => {
    mockApi({ plan: PLAN, send: { message: 'sent', ref: REF, existingAccount: true } });
    renderPage();
    await runTheModel();
    await screen.findByText('Your result is ready.');
    giveEmail();

    expect(await destination()).toBe('/login?source=retirement-calculator');
    expect(readRetirementSignupContext()?.sourceToken).toBe(REF);
  });

  it('attaches the run for a visitor already signed in and opens it in the app', async () => {
    window.localStorage.setItem('auth_token', SESSION);
    mockApi({ plan: PLAN, send: { message: 'sent', ref: REF, existingAccount: true }, signedInAs: 'reader@example.com' });
    renderPage();
    await runTheModel();
    await screen.findByText('Your result is ready.');
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com'));
    fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

    expect(await destination()).toBe('/app');
    expect(screen.queryByText(/retiring at 60 worked in/i)).not.toBeInTheDocument();
  });

  it('asks for a retry, and shows no verdict, when nothing was stored', async () => {
    mockApi({ plan: PLAN, send: { message: 'sent', ref: null } });
    renderPage();
    await runTheModel();
    await screen.findByText('Your result is ready.');
    giveEmail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save your result/i);
    expect(screen.queryByText(/retiring at 60 worked in/i)).not.toBeInTheDocument();
    expect(leaveForSignup).not.toHaveBeenCalled();
  });

  /*
   * A rates answer says nothing about the visitor's own plan and has no run
   * to save, so there is nothing to hold back.
   */
  it('shows a rates-only answer, which has no run to save', async () => {
    mockApi({ plan: RATES });
    renderPage();
    await runTheModel();

    expect(await screen.findByText(/what this mix sustained/i)).toBeInTheDocument();
    expect(screen.queryByText('Your result is ready.')).not.toBeInTheDocument();
  });

  it('fills in the address the other calculator was given', async () => {
    window.sessionStorage.setItem(CALCULATOR_EMAIL_STORAGE_KEY, 'reader@example.com');
    mockApi({ plan: PLAN });
    renderPage();
    await runTheModel();

    expect(await screen.findByText('Your result is ready.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');
  });
});
