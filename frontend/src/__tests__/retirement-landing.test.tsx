import React from 'react';
import { render, screen } from '@testing-library/react';
import { RetirementQuickPlan } from '@/components/marketing/RetirementQuickPlan';
import {
  MAX_RETIREMENT_AGE,
  MIN_RETIREMENT_AGE,
  readRetirementAge,
  retirementHeadline,
} from '@/lib/retirement-landing';

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
