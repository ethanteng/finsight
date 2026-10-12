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
import { leaveForSignup } from '@/lib/calculator-handover';

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
        // Stored, so a token comes back: the ordinary case.
        json: async () => ({ message: 'sent', ref: 'b'.repeat(48) }),
        ...emailResponse,
      });
    }
    return Promise.resolve({ ok: true, json: async () => planResult });
  }) as unknown as typeof fetch;
}

/** BASE_RESULT's verdict, as the page states it. */
const VERDICT = 'Retiring at 60 worked in 736 of 800 retirements in market history.';

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
  expect(screen.getByRole('button', { name: 'Unlock in Ask Linc' })).toBeInTheDocument();
});

/*
 * Placement is the point of where this sits: someone who reads their verdict
 * and stops should still be offered the way into Ask Linc. The capture sits on
 * the lock beside the answer, inside the results block — not further down past
 * two charts, and with no jump link standing in for it.
 */
it('keeps saving next to the result in the combined view', async () => {
  renderPage();
  await runTheModel();
  const field = await screen.findByLabelText('Email address');
  // On the locked plan, in the same block as the verdict.
  expect(field.closest('.calculator-locked-plan')).toHaveTextContent('Make it your plan.');
  expect(field.closest('.calculator-result-grid')).toHaveTextContent(VERDICT);
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
  fireEvent.click(await screen.findByRole('button', { name: /edit inputs.*run again/i }));
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

  await waitFor(() => expect(leaveForSignup).toHaveBeenCalled());
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

  await waitFor(() => expect(leaveForSignup).toHaveBeenCalled());
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
  expect(screen.getByRole('button', { name: 'Unlock in Ask Linc' })).toBeEnabled();
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
 * Nothing stored is a 503, so no account could open the run. The form asks
 * for a retry; the verdict is the page's own, so it stays where it is and
 * nothing leaves for signup.
 */
it('asks for a retry, and stays on the verdict, when nothing was stored', async () => {
  mockApi(BASE_RESULT, {
    ok: false,
    status: 503,
    json: async () => ({ error: 'We could not save your result just now. Please try again in a moment.' }),
  });
  renderPage();
  await runTheModel();

  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'reader@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);

  expect(await screen.findByRole('alert')).toHaveTextContent(/could not save your result/i);
  expect(screen.getByRole('heading', { name: VERDICT })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Unlock in Ask Linc' })).toBeEnabled();
  expect(leaveForSignup).not.toHaveBeenCalled();
});

/*
 * The run lands after an await, so its render is scheduled rather than flushed
 * with the submit, and a frame callback can run before it does (Firefox's
 * can). Scrolling from one found the results still hidden and left the
 * visitor below them. With frame callbacks held back entirely, the page must
 * still bring the results into view once they render.
 */
it('scrolls to the results once they render, not on the next frame', async () => {
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  try {
    renderPage();
    await runTheModel();

    const results = screen.getByLabelText('Your retirement result');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const scrolled = jest.mocked(Element.prototype.scrollIntoView).mock.contexts;
    expect(scrolled).toContain(results);
    expect(results).not.toHaveAttribute('hidden');
    expect(document.activeElement).toBe(results);
  } finally {
    raf.mockRestore();
  }
});

/*
 * The model no longer rations runs. The verdict is free on the page, so every
 * re-run answers too — and nothing the page keeps in the tab locks it on the
 * next render either. The lock is on what Ask Linc adds, not on the engine.
 */
it('keeps answering however many times the visitor runs it', async () => {
  const first = renderPage();

  for (let run = 0; run < 5; run += 1) {
    await runTheModel();
    expect(await screen.findByRole('heading', { name: VERDICT })).toBeInTheDocument();
  }

  fireEvent.click(screen.getByRole('button', { name: /edit inputs.*run again/i }));
  expect(screen.getByRole('button', { name: /run the model/i })).toBeEnabled();
  expect(screen.queryByText(/free runs/i)).not.toBeInTheDocument();
  first.unmount();

  const again = renderPage();
  expect(again.getByRole('button', { name: /run the model/i })).toBeEnabled();
  expect(again.getByText(/no email needed to see your result/i)).toBeInTheDocument();
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
  await waitFor(() => expect(leaveForSignup).toHaveBeenCalled());

  mockApi({
    ...BASE_RESULT,
    inputs: { ...INPUTS, retirementAge: 62 },
    primary: { ...BASE_RESULT.primary, retirementAge: 62, survivalRate: 0.97 },
  });
  await runTheModel();

  // A fresh form for the new plan: the earlier hand-off belonged to that run.
  await screen.findByRole('heading', { name: /retiring at 62 worked in/i });
  expect(screen.queryByText(/taking you to ask linc/i)).not.toBeInTheDocument();
  // The form is back for the new plan, holding the address already given in
  // this tab rather than asking for it again.
  expect(screen.getByLabelText('Email address')).toHaveValue('reader@example.com');
});
