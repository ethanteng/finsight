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
import { pushRetirementResultsEmailed, pushCalculatorRunLimitReached } from '@/lib/dataLayer';
import { leaveForSignup } from '@/lib/calculator-handover';
import { CALCULATOR_RUN_LIMIT, runLimitPhrase } from '@/lib/calculator-run-limit';

/*
 * jsdom implements neither navigation nor a `location` that can be replaced,
 * so the one function that leaves the page is mocked. Everything else in the
 * module is real: the cookie the component writes is one of the things these
 * cases are checking.
 */
jest.mock('@/lib/calculator-handover', () => ({
  ...jest.requireActual('@/lib/calculator-handover'),
  leaveForSignup: jest.fn(),
}));

jest.mock('@/lib/dataLayer', () => ({
  pushRetirementInteraction: jest.fn(),
  pushCalculatorRunLimitReached: jest.fn(),
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
 * Four endpoints answer here: the form's allocation options on mount, the
 * model run, the reading of it, and the results email. All but the first are
 * POSTs. The reading answers with something usable because the chevrons below
 * the capture only render when it does.
 */
function mockApi(planResult: unknown, emailResponse: Partial<Response> = { ok: true }) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (!init?.method) {
      return Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) });
    }
    posts.push({ url: String(url), body: JSON.parse(String(init.body)) });
    if (String(url).includes('/interpretation')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          headline: 'A reading.', paragraphs: ['A paragraph.'], watchOuts: [], model: 'test-model',
        }),
      });
    }
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

/*
 * Built from the constant rather than written out, so these keep testing the
 * behaviour rather than the default — `NEXT_PUBLIC_CALCULATOR_RUN_LIMIT` set
 * in a developer's environment would otherwise fail the suite.
 */
function runLockCopy(): RegExp {
  return new RegExp(`that is ${runLimitPhrase()}`, 'i');
}

async function runTheModel() {
  const edit = screen.queryByRole('button', { name: /edit inputs.*run again/i });
  if (edit) fireEvent.click(edit);
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);
  await waitFor(() => expect(screen.queryByRole('button', { name: /run the model/i })).not.toBeInTheDocument());
}

beforeEach(() => {
  posts.length = 0;
  emailed.mockClear();
  jest.mocked(leaveForSignup).mockClear();
  window.history.replaceState({}, '', '/retirement-calculator');
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

  await runTheModel();

  expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save these results to your free account' })).toBeInTheDocument();
});

/*
 * Placement is the point of where this sits: someone who reads their verdict
 * and stops should still be offered a copy of it. The capture belongs with the
 * answer, above the jump link, and both inside the results block — not further
 * down past two charts.
 */
it('keeps saving next to the result in the combined view', async () => {
  renderPage();
  await runTheModel();
  const field = await screen.findByLabelText('Email address');
  expect(field.closest('.calculator-result-grid')).toHaveTextContent(/retiring at 60 worked in/i);
  expect(screen.queryByRole('link', { name: /see what this result means/i })).not.toBeInTheDocument();
});

/*
 * The shortcut is a graphic now, so its name lives on the anchor. Losing that
 * would leave a link a screen reader announces as nothing at all.
 */
it('restores the entered numbers through the secondary edit action', async () => {
  renderPage();
  fireEvent.change(screen.getByLabelText('Investment assets today'), { target: { value: '1200000' } });
  await runTheModel();
  expect(screen.queryByRole('button', { name: /run the model/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /edit inputs.*run again/i }));
  expect(screen.getByRole('button', { name: /run the model/i })).toBeEnabled();
  expect(screen.getByLabelText('Investment assets today')).toHaveValue('1,200,000');
});

/*
 * A rates run has no survival figure — the model will not invent a portfolio
 * or a spending level — so there is nothing to send and no address to collect.
 */
it('stays away when the run produced no verdict to send', async () => {
  mockApi(RATES_RESULT);
  renderPage();

  await runTheModel();

  await screen.findByText(/what this mix sustained/i);
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
});

it('posts the plan inputs and never the figures computed from them', async () => {
  renderPage();
  await runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: ' Reader@Example.com ' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  await screen.findByText(/on its way/i);
  const send = posts.find((post) => post.url.includes('/email-results'))!;
  expect(send.body).toEqual({
    email: 'Reader@Example.com',
    ...INPUTS,
    attribution: { landingPage: '/retirement-calculator' },
  });
  // The server re-runs the model, so a verdict in the body would only be an
  // opportunity to disagree with it.
  expect(send.body).not.toHaveProperty('survivalRate');
});

it('reports the conversion as a band, never as the address or the exact rate', async () => {
  renderPage();
  await runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  await screen.findByText(/on its way/i);
  expect(emailed).toHaveBeenCalledTimes(1);
  expect(emailed).toHaveBeenCalledWith(0.92);
});

it('surfaces a refusal and leaves the form ready to retry', async () => {
  mockApi(BASE_RESULT, {
    ok: false,
    json: async () => ({ error: 'Enter a valid email address.' }),
  });
  renderPage();
  await runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
  expect(screen.getByRole('button', { name: 'Save these results to your free account' })).toBeEnabled();
  expect(emailed).not.toHaveBeenCalled();
});

/*
 * The ask is an account, not an inbox copy, so submitting takes the visitor to
 * the signup page rather than leaving them to go and find the message. The
 * email is still sent — it is what someone who wanders off comes back to.
 */
it('carries the run to signup instead of stopping at the inbox', async () => {
  const ref = 'a'.repeat(48);
  mockApi(BASE_RESULT, { ok: true, json: async () => ({ message: 'sent', ref }) });
  const assign = jest.mocked(leaveForSignup);

  renderPage();
  await runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  await waitFor(() => expect(assign).toHaveBeenCalled());
  const destination = assign.mock.calls[0][0] as string;
  // The page the emailed link lands on, marked so the two funnels stay apart.
  expect(destination).toContain('/getstarted?source=retirement-calculator');
  expect(destination).toContain('entry=results_page');
  // Never in the address of a page that renders: GTM records those.
  expect(destination).not.toContain(ref);

  // Both carriers, because they fail differently. The cookie is what
  // /getstarted exchanges; the stored run is what survives a refused cookie.
  //
  // The cookie is scoped to the path that spends it, so it is deliberately
  // invisible from the calculator — this reads it from where it is meant to
  // be read, which is also the only place it would ever be sent.
  window.history.replaceState({}, '', '/getstarted');
  expect(document.cookie).toContain(ref);
  const stored = JSON.parse(
    window.sessionStorage.getItem('asklinc.retirement-signup-context.v1')!,
  );
  expect(stored.sourceToken).toBe(ref);
  expect(stored.email).toBe('reader@example.com');
});

/*
 * No token came back — the lead did not store, or its disclosure did not — so
 * there is nothing to carry and the inbox is the only route left.
 */
it('stays on the page when no token comes back', async () => {
  const assign = jest.mocked(leaveForSignup);

  renderPage();
  await runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  await screen.findByText(/on its way/i);
  expect(assign).not.toHaveBeenCalled();
});

/*
 * Three runs answer the question the page asks. Past that it is being used as
 * a free modelling tool, and the only thing left to do is save the result —
 * which is the argument the page exists to make.
 */
it('locks the model after three runs and points at the save form', async () => {
  renderPage();

  for (let run = 0; run < CALCULATOR_RUN_LIMIT; run += 1) {
    await runTheModel();
    await screen.findByLabelText('Email address');
  }

  expect(screen.queryByRole('button', { name: /run the model/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /edit inputs.*run again/i })).not.toBeInTheDocument();
  expect(screen.getByText(/you’ve used your free runs/i)).toBeVisible();
  await waitFor(() => expect(pushCalculatorRunLimitReached).toHaveBeenCalledTimes(1));
  expect(pushCalculatorRunLimitReached).toHaveBeenCalledWith('retirement');
  // The save form is still there: it is what the lock is pointing at.
  expect(screen.getByRole('button', { name: 'Save these results to your free account' })).toBeEnabled();
});

/*
 * A rates-only answer has no capture form, and the page deliberately refuses
 * to hand one to signup. Counting them would let three spend the allowance and
 * leave the visitor locked out of entering the full plan that *would* have
 * been savable — while the lock tells them to save a result they cannot.
 */
it('does not spend a run on a result that cannot be saved', async () => {
  mockApi(RATES_RESULT);
  renderPage();

  for (let run = 0; run < CALCULATOR_RUN_LIMIT + 1; run += 1) {
    await runTheModel();
    await screen.findByText(/what this mix sustained/i);
  }

  expect(screen.getByRole('button', { name: /edit inputs.*run again/i })).toBeEnabled();
  expect(screen.queryByText(runLockCopy())).not.toBeInTheDocument();
});

/* The count survives a reload, so it is not shrugged off by refreshing. */
it('is still locked after the page is rendered again', async () => {
  const first = renderPage();
  for (let run = 0; run < CALCULATOR_RUN_LIMIT; run += 1) {
    await runTheModel();
    await screen.findByLabelText('Email address');
  }
  first.unmount();

  const again = renderPage();

  await waitFor(() => {
    expect(again.getByRole('button', { name: /run the model/i })).toBeDisabled();
  });
});

it('keeps the typed address out of Contentsquare recordings', async () => {
  renderPage();
  await runTheModel();

  expect(await screen.findByLabelText('Email address')).toHaveAttribute('data-cs-mask');
});

/*
 * The confirmation belongs to the plan it was sent for. Someone who emails one
 * run, changes a number and re-runs must not see the new answer claiming its
 * figures were already sent.
 */
it('resets the capture when a new plan is run', async () => {
  renderPage();
  await runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);
  await screen.findByText(/on its way/i);

  mockApi({
    ...BASE_RESULT,
    inputs: { ...INPUTS, retirementAge: 62 },
    primary: { ...BASE_RESULT.primary, retirementAge: 62, survivalRate: 0.97 },
  });
  await runTheModel();

  await waitFor(() => expect(screen.queryByText(/on its way/i)).not.toBeInTheDocument());
  expect(screen.getByLabelText('Email address')).toHaveValue('');
});
