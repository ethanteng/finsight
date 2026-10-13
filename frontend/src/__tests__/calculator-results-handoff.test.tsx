/**
 * From a calculator answer into Ask Linc.
 *
 * Both calculators show their answer on the page, with the details Ask Linc
 * also plans with locked beside it and an email form on the lock. What matters
 * here is that the answer is the page's own — it stays put through a failed
 * save and asks for no model reading — that the page CTA carries no run, and
 * that the address takes the run to the right door, saying where it is going:
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
const SESSION = 'session-token';

interface Api {
  plan?: unknown;
  /** What `email-results` answers. */
  send?: Record<string, unknown>;
  /** HTTP status for `email-results` (default 200). */
  sendStatus?: number;
  /** Whether `POST /auth/calculator-lead` attaches. */
  attached?: boolean;
  /** The signed-in account's address, for `GET /auth/verify`. */
  signedInAs?: string;
}

const calls: Array<{ url: string; init?: RequestInit }> = [];

function mockApi({
  plan = null,
  send = { message: 'sent', ref: REF },
  sendStatus = 200,
  attached = true,
  signedInAs,
}: Api = {}) {
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
      return Promise.resolve({
        ok: sendStatus >= 200 && sendStatus < 300,
        status: sendStatus,
        json: async () => send,
      });
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

  it('shows the answer, with what Ask Linc adds locked beside it', () => {
    render(<CoastFireCalculator />);
    calculate();

    expect(screen.getByRole('heading', { name: 'You’ve reached Coast FIRE.' })).toBeInTheDocument();
    expect(screen.getByText(COAST_FIRE_NUMBER)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sanity-check your plan.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock deeper analysis' })).toBeInTheDocument();
    // The formula's own figures, so there is nothing for a model to read.
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
    expect(screen.getByRole('heading', { name: 'Taking you to Ask Linc…' })).toBeInTheDocument();
    expect(screen.getByText(/choose a password and your coast fire plan opens as your first decision/i)).toBeInTheDocument();
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
    expect(screen.getByText(/sign in and your coast fire plan opens as a new decision/i)).toBeInTheDocument();
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
    expect(screen.getByText('Your Coast FIRE plan is saved in your account. Opening it…')).toBeInTheDocument();
  });

  /*
   * A session whose account the lead does not name (they typed some other
   * address) attaches nothing, so the run follows the address they typed —
   * into signup for that address, not into the session's account.
   */
  it('follows the typed address when a session cannot take the run', async () => {
    window.localStorage.setItem('auth_token', SESSION);
    mockApi({ attached: false, signedInAs: 'someone-else@example.com' });
    render(<CoastFireCalculator />);
    calculate();
    giveEmail('reader@example.com');

    expect(await destination()).toContain('/getstarted?source=coast-fire-calculator');
    expect(requested('/auth/calculator-lead')).toBe(true);
    expect(screen.getByText(/choose a password and your coast fire plan opens as your first decision/i)).toBeInTheDocument();
  });

  /*
   * Nothing stored is a 503: an error to retry. The answer is the page's own,
   * so it stays where it is and nothing leaves.
   */
  it('asks for a retry, and stays on the answer, when nothing was stored', async () => {
    mockApi({
      send: { error: 'We could not save your result just now. Please try again in a moment.' },
      sendStatus: 503,
    });
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save your result/i);
    expect(screen.getByText(COAST_FIRE_NUMBER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock deeper analysis' })).toBeEnabled();
    expect(leaveForSignup).not.toHaveBeenCalled();
  });

  /*
   * 200 without a ref means the ready email went out but the disclosure stamp
   * did not, so the token must not sit in the page. Point at the inbox rather
   * than inviting another lead.
   */
  it('points at the emailed link when the token cannot be handed to the page', async () => {
    mockApi({ send: { message: 'sent', ref: null } });
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/check your email for a link to open this plan in ask linc/i);
    expect(screen.getByText(COAST_FIRE_NUMBER)).toBeInTheDocument();
    expect(leaveForSignup).not.toHaveBeenCalled();
  });

  /*
   * A second run in the same tab answers on the page and gets its own lock
   * and form. The address is remembered so the next form does not ask for it
   * again.
   */
  it('answers the next run too, with the address already filled in', async () => {
    render(<CoastFireCalculator />);
    calculate();
    giveEmail();
    await destination();

    calculate();

    expect(screen.getByText(COAST_FIRE_NUMBER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock deeper analysis' })).toBeEnabled();
    expect(screen.queryByText('Taking you to Ask Linc…')).not.toBeInTheDocument();
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

  const VERDICT = 'Retiring at 60 worked in 736 of 800 retirements in market history.';

  it('shows the verdict, with what Ask Linc adds locked beside it', async () => {
    mockApi({ plan: PLAN });
    renderPage();
    await runTheModel();

    expect(await screen.findByRole('heading', { name: VERDICT })).toBeInTheDocument();
    expect(screen.getByText('How much you could spend each year')).toBeInTheDocument();
    expect(screen.getByText('The two levers these numbers can pull')).toBeInTheDocument();
    expect(screen.getByText('HOW THE ENGINE READ THIS ASSET MIX')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sanity-check your plan.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock deeper analysis' })).toBeInTheDocument();
    // The engine's own figures: a plan answer asks no model for a reading.
    expect(requested('/interpretation')).toBe(false);
    // The page's own CTA does not carry the run into signup either.
    expect(screen.getByRole('link', { name: 'Build my retirement plan' })).toBeInTheDocument();
  });

  it('sends a new address to signup with the run', async () => {
    mockApi({ plan: PLAN });
    renderPage();
    await runTheModel();
    await screen.findByRole('button', { name: 'Unlock deeper analysis' });
    giveEmail();

    expect(await destination()).toContain('/getstarted?source=retirement-calculator');
    expect(readRetirementSignupContext()?.sourceToken).toBe(REF);
    expect(screen.getByRole('heading', { name: 'Taking you to Ask Linc…' })).toBeInTheDocument();
    expect(screen.getByText(/choose a password and your retirement plan opens as your first decision/i)).toBeInTheDocument();
  });

  it('sends an existing account to sign in with the run', async () => {
    mockApi({ plan: PLAN, send: { message: 'sent', ref: REF, existingAccount: true } });
    renderPage();
    await runTheModel();
    await screen.findByRole('button', { name: 'Unlock deeper analysis' });
    giveEmail();

    expect(await destination()).toBe('/login?source=retirement-calculator');
    expect(readRetirementSignupContext()?.sourceToken).toBe(REF);
    expect(screen.getByText(/sign in and your retirement plan opens as a new decision/i)).toBeInTheDocument();
  });

  it('attaches the run for a visitor already signed in and opens it in the app', async () => {
    window.localStorage.setItem('auth_token', SESSION);
    mockApi({ plan: PLAN, send: { message: 'sent', ref: REF, existingAccount: true }, signedInAs: 'reader@example.com' });
    renderPage();
    await runTheModel();
    await screen.findByRole('button', { name: 'Unlock deeper analysis' });
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com'));
    fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

    expect(await destination()).toBe('/app');
    expect(screen.getByText('Your retirement plan is saved in your account. Opening it…')).toBeInTheDocument();
  });

  /*
   * Nothing stored is a 503: an error to retry. The verdict is the page's
   * own, so it stays where it is and nothing leaves.
   */
  it('asks for a retry, and stays on the verdict, when nothing was stored', async () => {
    mockApi({
      plan: PLAN,
      send: { error: 'We could not save your result just now. Please try again in a moment.' },
      sendStatus: 503,
    });
    renderPage();
    await runTheModel();
    await screen.findByRole('button', { name: 'Unlock deeper analysis' });
    giveEmail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save your result/i);
    expect(screen.getByRole('heading', { name: VERDICT })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock deeper analysis' })).toBeEnabled();
    expect(leaveForSignup).not.toHaveBeenCalled();
  });

  it('points at the emailed link when the token cannot be handed to the page', async () => {
    mockApi({ plan: PLAN, send: { message: 'sent', ref: null } });
    renderPage();
    await runTheModel();
    await screen.findByRole('button', { name: 'Unlock deeper analysis' });
    giveEmail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/check your email for a link to open this plan in ask linc/i);
    expect(screen.getByRole('heading', { name: VERDICT })).toBeInTheDocument();
    expect(leaveForSignup).not.toHaveBeenCalled();
  });

  /*
   * A rates answer says nothing about the visitor's own plan and has no run
   * to save, so there is nothing to lock and no form to unlock it.
   */
  it('shows a rates-only answer, which has no run to save', async () => {
    mockApi({ plan: RATES });
    renderPage();
    await runTheModel();

    expect(await screen.findByText(/what this mix sustained/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sanity-check your plan.' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it('fills in the address the other calculator was given', async () => {
    window.sessionStorage.setItem(CALCULATOR_EMAIL_STORAGE_KEY, 'reader@example.com');
    mockApi({ plan: PLAN });
    renderPage();
    await runTheModel();

    expect(await screen.findByRole('button', { name: 'Unlock deeper analysis' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');
  });
});
