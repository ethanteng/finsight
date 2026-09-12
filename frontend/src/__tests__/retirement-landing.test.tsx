import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { trackContentsquareEvent } from '@/lib/contentsquare';
import { RetirementQuickPlan } from '@/components/marketing/RetirementQuickPlan';
import { CONNECTED_EXAMPLE_ID } from '@/components/marketing/RetirementConnectedExample';
import {
  MAX_RETIREMENT_AGE,
  MIN_RETIREMENT_AGE,
  readRetirementAge,
  retirementHeadline,
} from '@/lib/retirement-landing';
import {
  RETIREMENT_SIGNUP_HREF,
  readRetirementSignupContext,
} from '@/lib/retirement-signup-context';

jest.mock('@/lib/contentsquare', () => ({ trackContentsquareEvent: jest.fn() }));

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

describe('retirement landing ad parameter', () => {
  it('reads the age the ad was bought on', () => {
    expect(readRetirementAge({ retirement_age: '62' })).toBe(62);
    expect(readRetirementAge({ retirement_age: ' 55 ' })).toBe(55);
  });

  it('accepts the utm_-prefixed spelling a campaign builder may use', () => {
    expect(readRetirementAge({ utm_retirement_age: '67' })).toBe(67);
  });

  it('prefers the plain parameter when both are present', () => {
    expect(readRetirementAge({ retirement_age: '60', utm_retirement_age: '70' })).toBe(60);
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(readRetirementAge({ retirement_age: ['62', '70'] })).toBe(62);
  });

  it('treats anything outside the model\'s range as absent', () => {
    expect(readRetirementAge({ retirement_age: String(MIN_RETIREMENT_AGE - 1) })).toBeNull();
    expect(readRetirementAge({ retirement_age: String(MAX_RETIREMENT_AGE + 1) })).toBeNull();
    expect(readRetirementAge({ retirement_age: '0' })).toBeNull();
  });

  it('never echoes a value that is not a plain number', () => {
    expect(readRetirementAge({ retirement_age: '62<script>' })).toBeNull();
    expect(readRetirementAge({ retirement_age: 'sixty' })).toBeNull();
    expect(readRetirementAge({ retirement_age: '6.5' })).toBeNull();
    expect(readRetirementAge({ retirement_age: '' })).toBeNull();
    expect(readRetirementAge({})).toBeNull();
  });

  it('asks the ad\'s question when there is one and a generic one otherwise', () => {
    expect(retirementHeadline(62)).toBe('Can I retire at 62?');
    expect(retirementHeadline(null)).toBe('When can I retire?');
  });
});

describe('retirement landing page', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    window.sessionStorage.clear();
    jest.clearAllMocks();
  });

  // The burst of `invalid` events is now collapsed on a timer rather than on
  // the first one, so the single event carries the whole submission: the field
  // the browser focused, and the count behind it.
  it('counts one start and deduplicates per-field validation errors', async () => {
    const { container } = render(<RetirementQuickPlan headline="When can I retire?" initialRetirementAge={null} />);
    fireEvent.change(screen.getByLabelText('Current age'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Current age'), { target: { value: '51' } });
    fireEvent.invalid(screen.getByLabelText('Retirement age'));
    fireEvent.invalid(screen.getByLabelText('Investment assets today'));
    expect(trackContentsquareEvent).toHaveBeenNthCalledWith(1, 'retirement_calculator_field_edited');
    expect(trackContentsquareEvent).toHaveBeenNthCalledWith(2, 'retirement_calculator_started');
    await waitFor(() => {
      expect(trackContentsquareEvent).toHaveBeenNthCalledWith(3, 'retirement_validation_error');
    });
    expect(trackContentsquareEvent).toHaveBeenCalledTimes(3);
    expect(container.querySelector('.qp-results')).toBeNull();
  });

  it('does not count prefills or focus as a field edit', () => {
    render(<RetirementQuickPlan headline="When can I retire?" initialRetirementAge={60} />);
    fireEvent.focus(screen.getByLabelText('Current age'));
    fireEvent.click(screen.getByRole('button', { name: 'Run the model' }));
    expect(trackContentsquareEvent).toHaveBeenCalledWith('retirement_model_clicked');
    expect(trackContentsquareEvent).not.toHaveBeenCalledWith('retirement_calculator_field_edited');
  });

  // An untouched form used to be stopped by the browser. Nothing is required
  // now, so the run happens and the model answers what it can.
  it('runs the model from an untouched form instead of refusing to submit', () => {
    const { container } = render(<RetirementQuickPlan headline="When can I retire?" initialRetirementAge={null} />);
    fireEvent.submit(container.querySelector('form')!);
    expect(trackContentsquareEvent).toHaveBeenCalledWith('retirement_model_requested');
    expect(trackContentsquareEvent).not.toHaveBeenCalledWith('retirement_validation_error');
  });

  it('counts select and allocation edits once per mount, without sending values', () => {
    const { rerender } = render(<React.StrictMode><RetirementQuickPlan headline="When can I retire?" initialRetirementAge={60} /></React.StrictMode>);
    fireEvent.change(screen.getByLabelText('starting at'), { target: { value: '62' } });
    fireEvent.click(screen.getByRole('radio', { name: /Growth/ }));
    rerender(<React.StrictMode><RetirementQuickPlan headline="Updated headline" initialRetirementAge={60} /></React.StrictMode>);
    const edits = jest.mocked(trackContentsquareEvent).mock.calls.filter(([event]) => event === 'retirement_calculator_field_edited');
    expect(edits).toEqual([['retirement_calculator_field_edited']]);
  });

  it.each(['api', 'network'] as const)('does not count a %s failure as a successful result', async (failure) => {
    global.fetch = jest.fn().mockImplementation((_url, init) => {
      if (!init?.method) return Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) });
      return failure === 'api'
        ? Promise.resolve({ ok: false, json: async () => ({ error: 'Test failure' }) })
        : Promise.reject(new Error('offline'));
    });
    const { container } = render(<RetirementQuickPlan headline="When can I retire?" initialRetirementAge={60} />);
    fireEvent.submit(container.querySelector('form')!);
    await screen.findByRole('alert');
    expect(trackContentsquareEvent).toHaveBeenCalledWith('retirement_model_requested');
    expect(trackContentsquareEvent).not.toHaveBeenCalledWith('retirement_calculator_field_edited');
    expect(trackContentsquareEvent).toHaveBeenCalledWith(failure === 'api' ? 'retirement_api_error' : 'retirement_request_error');
    expect(trackContentsquareEvent).not.toHaveBeenCalledWith('retirement_model_run');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run the model' })).toBeEnabled());
  });

  it('counts each committed result once, including a deliberate rerun, under Strict Mode', async () => {
    const result = {
      inputs: { retirementAge: 60, socialSecurityStartAge: 67, socialSecurityAnnual: 20000, annualSpending: 50000, lifeExpectancy: 95 },
      mode: 'plan', assumed: [], missing: [],
      allocation: { label: 'Balanced' },
      history: { firstMonth: '1926-01', lastMonth: '2025-12', firstStartMonth: '1926-01', horizonYears: 45, sequencesTested: 100 },
      primary: {
        id: 'primary', label: 'Your plan', survivalRate: 0.9, sequencesTested: 100, sequencesSurvived: 90,
        projectedPortfolioAtRetirement: 1000000, firstYearPortfolioWithdrawal: 50000, firstYearWithdrawalRate: 0.05,
        primaryObservation: 'Example', tradeoffs: { upside: 'Example', downside: 'Example' }, characteristics: {},
      },
      alternatives: [], sustainableSpending: { p10: 30000, p25: 40000, p50: 50000, p75: 60000, p90: 70000, solverFloorRate: 0.01, solverCeilingRate: 0.15 },
      limitations: [], assumptions: [],
    };
    global.fetch = jest.fn().mockImplementation((_url, init) => Promise.resolve({
      ok: true, json: async () => init?.method ? { ...result } : { allocations: [] },
    }));
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = jest.fn();
    try {
      const { container } = render(<React.StrictMode><RetirementQuickPlan headline="When can I retire?" initialRetirementAge={60} /></React.StrictMode>);
      expect(trackContentsquareEvent).not.toHaveBeenCalledWith('retirement_model_run');
      fireEvent.submit(container.querySelector('form')!);
      await screen.findByText(/Based on the numbers you entered/);
      const successes = () => jest.mocked(trackContentsquareEvent).mock.calls.filter(([event]) => event === 'retirement_model_run');
      await waitFor(() => expect(successes()).toHaveLength(1));
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => expect(successes()).toHaveLength(2));
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });

  it('offers a jump from the result to the section that argues for connecting accounts', async () => {
    // That section is four blocks below the result. Without this link a visitor
    // who reads their answer and stops never reaches the pitch — and the link
    // has to point at an id something on the page actually carries.
    const result = {
      inputs: { retirementAge: 60, socialSecurityStartAge: 67, socialSecurityAnnual: 20000, annualSpending: 50000, lifeExpectancy: 95 },
      mode: 'plan', assumed: [], missing: [],
      allocation: { label: 'Balanced' },
      history: { firstMonth: '1926-01', lastMonth: '2025-12', firstStartMonth: '1926-01', horizonYears: 45, sequencesTested: 100 },
      primary: {
        id: 'primary', label: 'Your plan', survivalRate: 0.9, sequencesTested: 100, sequencesSurvived: 90,
        projectedPortfolioAtRetirement: 1000000, firstYearPortfolioWithdrawal: 50000, firstYearWithdrawalRate: 0.05,
        primaryObservation: 'Example', tradeoffs: { upside: 'Example', downside: 'Example' }, characteristics: {},
      },
      alternatives: [], sustainableSpending: { p10: 30000, p25: 40000, p50: 50000, p75: 60000, p90: 70000, solverFloorRate: 0.01, solverCeilingRate: 0.15 },
      limitations: [], assumptions: [],
    };
    global.fetch = jest.fn().mockImplementation((_url, init) => Promise.resolve({
      ok: true, json: async () => init?.method ? { ...result } : { allocations: [] },
    }));
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = jest.fn();
    try {
      const { container } = render(<RetirementQuickPlan headline="When can I retire?" initialRetirementAge={60} />);
      fireEvent.submit(container.querySelector('form')!);
      await screen.findByText(/Based on the numbers you entered/);

      const jump = container.querySelector('.qp-jump') as HTMLAnchorElement | null;
      expect(jump).not.toBeNull();
      expect(jump!.getAttribute('href')).toBe(`#${CONNECTED_EXAMPLE_ID}`);
      expect(container.querySelector(`#${CONNECTED_EXAMPLE_ID}`)).not.toBeNull();
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });

  it('continues a completed model with its validated inputs and no financial analytics fields', async () => {
    const result = {
      inputs: {
        currentAge: 48,
        retirementAge: 60,
        investableAssets: 1_200_000,
        annualSpending: 95_000,
        annualContributions: 35_000,
        socialSecurityAnnual: 36_000,
        socialSecurityStartAge: 67,
        lifeExpectancy: 95,
        allocation: 'balanced',
      },
      mode: 'plan', assumed: [], missing: [],
      allocation: { id: 'balanced', label: 'Balanced', description: 'Example', equityPercent: 60 },
      history: { firstMonth: '1926-01', lastMonth: '2025-12', firstStartMonth: '1926-01', lastStartMonth: '1980-12', horizonYears: 47, sequencesTested: 100 },
      primary: {
        id: 'primary', label: 'Your plan', change: null, retirementAge: 60, annualSpending: 95_000,
        survivalRate: 0.9, sequencesTested: 100, sequencesSurvived: 90,
        projectedPortfolioAtRetirement: 1_700_000, firstYearPortfolioWithdrawal: 95_000,
        firstYearWithdrawalRate: 0.055, depletionYears: null, primaryObservation: 'Example',
        tradeoffs: { upside: 'Example', downside: 'Example' }, characteristics: {},
      },
      alternatives: [],
      sustainableSpending: { p10: 70_000, p25: 80_000, p50: 90_000, p75: 100_000, p90: 110_000, solverFloorRate: 0.01, solverCeilingRate: 0.15 },
      limitations: [],
      assumptions: [],
    };
    global.fetch = jest.fn().mockImplementation((_url, init) => Promise.resolve({
      ok: true,
      json: async () => init?.method ? result : { allocations: [] },
    }));
    window.history.replaceState({}, '', '/retirement-calculator');
    const analyticsWindow = window as Window & { dataLayer?: Array<Record<string, unknown>> };
    analyticsWindow.dataLayer = [];
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = jest.fn();

    try {
      const { container } = render(<RetirementQuickPlan headline="When can I retire?" initialRetirementAge={60} />);
      fireEvent.submit(container.querySelector('form')!);
      await screen.findByText(/Based on the numbers you entered/);

      expect(screen.getByText(/carry forward the retirement age, assets, and spending/i)).toBeInTheDocument();
      const cta = screen.getByRole('link', { name: 'Stress-test this with my actual finances' });
      expect(cta).toHaveAttribute('href', RETIREMENT_SIGNUP_HREF);
      expect(cta).toHaveAttribute('data-cs-override-id', 'cta-start-free-trial-quickplan');
      expect(container.querySelector('.qp-results')?.parentElement).toHaveAttribute('data-cs-mask');

      // Isolate the CTA event from the model-run events that preceded it.
      analyticsWindow.dataLayer = [];
      cta.addEventListener('click', (event) => event.preventDefault(), { once: true });
      fireEvent.click(cta);

      expect(readRetirementSignupContext()?.inputs).toEqual(result.inputs);
      expect(analyticsWindow.dataLayer).toEqual([{
        event: 'start_free_click',
        source_page: '/retirement-calculator',
        cta_location: 'quickplan_cross_sell',
        content_type: 'retirement_calculator',
        destination_page: '/getstarted',
      }]);
      expect(JSON.stringify(analyticsWindow.dataLayer)).not.toContain('1200000');
      expect(JSON.stringify(analyticsWindow.dataLayer)).not.toContain('95000');
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });

  it('shows the ad\'s question and prefills the age it was bought on', () => {
    render(<RetirementQuickPlan headline={retirementHeadline(62)} initialRetirementAge={62} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Can I retire at 62?');
    expect(screen.getByLabelText('Retirement age')).toHaveValue('62');
  });

  it('leaves the age blank and asks the open question without a parameter', () => {
    render(<RetirementQuickPlan headline={retirementHeadline(null)} initialRetirementAge={null} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('When can I retire?');
    expect(screen.getByLabelText('Retirement age')).toHaveValue('');
  });

  it('prefers the presets the API serves over its own fallback copy', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        allocations: [
          { id: 'balanced', label: 'Balanced', description: '55% US stocks · 40% bonds · 5% cash' },
        ],
      }),
    }) as unknown as typeof fetch;

    render(<RetirementQuickPlan headline={retirementHeadline(60)} initialRetirementAge={60} />);

    // The server is the authority on what the presets are, so a preset changed
    // there must not silently drift from the form the visitor fills in.
    expect(await screen.findByText('55% US stocks · 40% bonds · 5% cash')).toBeInTheDocument();
    expect(screen.queryByText('60% US stocks · 35% bonds · 5% cash')).toBeNull();
  });

  it('keeps its fallback presets when the options lookup fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    render(<RetirementQuickPlan headline={retirementHeadline(60)} initialRetirementAge={60} />);

    expect(await screen.findByText('60% US stocks · 35% bonds · 5% cash')).toBeInTheDocument();
  });

  it('ignores a served preset this form cannot submit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allocations: [{ id: 'wildcat', label: 'Wildcat', description: 'all in' }] }),
    }) as unknown as typeof fetch;

    render(<RetirementQuickPlan headline={retirementHeadline(60)} initialRetirementAge={60} />);

    expect(await screen.findByText('60% US stocks · 35% bonds · 5% cash')).toBeInTheDocument();
    expect(screen.queryByText('all in')).toBeNull();
  });

  it('presents no chat input anywhere on the page', () => {
    const { container } = render(
      <RetirementQuickPlan headline={retirementHeadline(60)} initialRetirementAge={60} />
    );

    expect(container.querySelector('textarea')).toBeNull();
    for (const input of Array.from(container.querySelectorAll('input'))) {
      expect(['radio', 'text', '']).toContain(input.getAttribute('type') ?? '');
    }
  });
});
