/**
 * What the calculator does with a submission it cannot run.
 *
 * Both halves used to end at the same dead end: the browser blocked the submit
 * and analytics recorded only that something was invalid, or the model rejected
 * one number and the page showed the reason in a banner six fields away with
 * the field name discarded. These cover the field attribution on both paths.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RetirementQuickPlan } from '@/components/marketing/RetirementQuickPlan';
import { pushRetirementInteraction } from '@/lib/dataLayer';

jest.mock('@/lib/dataLayer', () => ({
  pushRetirementInteraction: jest.fn(),
  pushRetirementModelRun: jest.fn(),
}));

// Recharts needs a ResizeObserver jsdom does not provide, and these cases are
// about the copy around the chart rather than the chart.
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

const interaction = jest.mocked(pushRetirementInteraction);

function renderPage() {
  return render(<RetirementQuickPlan headline="Can I retire at 60?" initialRetirementAge={60} />);
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Every field the form requires, so a submit reaches the endpoint. */
function fillValidPlan() {
  fill(/current age/i, '52');
  fill(/retirement age/i, '60');
  fill(/investment assets today/i, '1200000');
  fill(/annual spending in retirement/i, '95000');
}

/** A rates-mode response: no portfolio given, so no dollars and no verdict. */
const RATES_RESULT = {
  mode: 'rates',
  assumed: [
    { field: 'retirementAge', value: 65, note: 'Retiring at 65, the conventional planning age.' },
    { field: 'currentAge', value: 65, note: 'Retiring now rather than saving for it, since no current age was given.' },
  ],
  missing: ['investableAssets', 'annualSpending'],
  inputs: {
    currentAge: 65, retirementAge: 65, investableAssets: 1_000_000, annualSpending: 40_000,
    annualContributions: 0, socialSecurityAnnual: 0, socialSecurityStartAge: 67,
    lifeExpectancy: 95, allocation: 'balanced',
  },
  allocation: { id: 'balanced', label: 'Balanced', description: 'Example', equityPercent: 60 },
  history: {
    firstMonth: '1926-07', lastMonth: '2025-12', firstStartMonth: '1926-07',
    lastStartMonth: '1995-12', horizonYears: 30, sequencesTested: 834,
  },
  primary: null,
  alternatives: [],
  sustainableSpending: null,
  sustainableSpendingRates: {
    p10: 0.031, p25: 0.036, p50: 0.04, p75: 0.047, p90: 0.055,
    solverFloorRate: 0.02, solverCeilingRate: 0.08,
  },
  assumptions: [],
  limitations: [],
};

beforeEach(() => {
  window.sessionStorage.clear();
  interaction.mockClear();
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ allocations: [] }) });
});

it('reports which field blocked a submission, and how many were failing', async () => {
  renderPage();
  const spending = screen.getByLabelText(/annual spending in retirement/i);
  const assets = screen.getByLabelText(/investment assets today/i);

  // The browser fires one of these per failing control during a blocked submit.
  fireEvent.invalid(spending);
  fireEvent.invalid(assets);

  await waitFor(() => {
    expect(interaction).toHaveBeenCalledWith('retirement_validation_error', {
      errorField: 'annualSpending',
      invalidFieldCount: 2,
    });
  });
});

it('requires nothing, so the browser never blocks a submission', () => {
  renderPage();
  for (const label of [
    /current age/i,
    /retirement age/i,
    /investment assets today/i,
    /annual spending in retirement/i,
    /annual contributions until then/i,
    /social security estimate/i,
  ]) {
    expect(screen.getByLabelText(label)).not.toBeRequired();
  }
});

it('omits a blank field rather than posting it as zero', async () => {
  const calls: Array<Record<string, unknown>> = [];
  (global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
    if (!init?.method) return Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) });
    calls.push(JSON.parse(String(init.body)));
    return Promise.resolve({ ok: true, json: async () => RATES_RESULT });
  });

  renderPage();
  fill(/current age/i, '52');
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);

  await waitFor(() => expect(calls).toHaveLength(1));
  // Zero is an answer the model would reject; absent is a blank it answers around.
  expect(calls[0]).not.toHaveProperty('investableAssets');
  expect(calls[0]).not.toHaveProperty('annualSpending');
  expect(calls[0]).toMatchObject({ currentAge: 52 });
});

it('answers in rates, names what it assumed, and invents no dollar figure', async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(init?.method
      ? { ok: true, json: async () => RATES_RESULT }
      : { ok: true, json: async () => ({ allocations: [] })})
  );

  renderPage();
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);

  const results = await screen.findByText(/what this mix sustained/i);
  const panel = results.closest('section')!;
  // The cautious figure leads, not the median.
  expect(panel).toHaveTextContent(/3\.1% of the portfolio a year/);
  expect(panel).toHaveTextContent(/4\.0%/);
  expect(panel).toHaveTextContent(/Retiring at 65, the conventional planning age/);
  expect(panel).toHaveTextContent(/what you have invested and what you expect to spend/);
  // The notional portfolio the run was normalized against must never surface.
  expect(panel.textContent).not.toContain('1,000,000');
  expect(panel.textContent).not.toContain('$');
});

it('does not carry a notional portfolio into the signup handoff', async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(init?.method
      ? { ok: true, json: async () => RATES_RESULT }
      : { ok: true, json: async () => ({ allocations: [] })})
  );

  renderPage();
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);
  await screen.findByText(/what this mix sustained/i);

  // The plan-mode CTA forwards the entered scenario; a rates run has none.
  expect(screen.queryByRole('link', { name: /run this with my actual finances/i })).toBeNull();
  expect(window.sessionStorage.getItem('asklinc.retirement-signup-context.v1')).toBeNull();
});

it('shows a rejected number under the field it is about, and names the field to analytics', async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) =>
    String(url).endsWith('/options')
      ? Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) })
      : Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            error: 'Annual spending must be between 1,000 and 10,000,000.',
            field: 'annualSpending',
          }),
        })
  );

  renderPage();
  fillValidPlan();
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);

  const message = await screen.findByText(/annual spending must be between/i);
  expect(message).toHaveAttribute('id', 'annualSpending-error');
  const spending = screen.getByLabelText(/annual spending in retirement/i);
  expect(spending).toHaveAttribute('aria-invalid', 'true');
  expect(spending).toHaveAttribute('aria-describedby', 'annualSpending-error');

  expect(interaction).toHaveBeenCalledWith('retirement_api_error', {
    errorField: 'annualSpending',
    errorStatus: 400,
  });
});

it('clears a field rejection once that field is edited', async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) =>
    String(url).endsWith('/options')
      ? Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) })
      : Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Current age must be between 18 and 90.', field: 'currentAge' }),
        })
  );

  renderPage();
  fillValidPlan();
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);
  await screen.findByText(/current age must be between/i);

  fill(/current age/i, '55');
  await waitFor(() => {
    expect(screen.queryByText(/current age must be between/i)).not.toBeInTheDocument();
  });
});

it('keeps an error the model could not blame on a field in the banner', async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) =>
    String(url).endsWith('/options')
      ? Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) })
      : Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: 'Too many requests. Please wait a moment and try again.' }),
        })
  );

  renderPage();
  fillValidPlan();
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);

  const banner = await screen.findByText(/too many requests/i);
  expect(banner).toHaveClass('qp-error');
  expect(interaction).toHaveBeenCalledWith('retirement_api_error', {
    errorField: undefined,
    errorStatus: 429,
  });
});
