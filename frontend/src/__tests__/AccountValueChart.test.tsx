import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AccountValueChart, {
  availableRanges,
  describeChange,
  describeSource,
  formatAxisMoney,
  pointsInRange,
} from '@/components/finances/AccountValueChart';
import type { AccountValueHistory, FinancesAccount } from '@/types/finances-overview';

// jsdom has no layout, so the chart itself renders nothing; what it is given is the point.
jest.mock('recharts', () => {
  const Recharts = jest.requireActual('recharts');
  return {
    ...Recharts,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div data-testid="chart">{React.cloneElement(children, { width: 600, height: 240 })}</div>
    ),
  };
});

function daily(start: string, count: number, valueAt: (index: number) => number) {
  const [year, month, day] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(year, month - 1, day + index)).toISOString().slice(0, 10),
    value: valueAt(index),
  }));
}

const brokerage: FinancesAccount = {
  account_id: 'brk-1',
  name: 'Retirement Bridge Fund',
  type: 'investment',
  institution: 'Betterment',
  source: 'plaid',
};

function history(overrides: Partial<AccountValueHistory>): AccountValueHistory {
  return {
    revisionId: 'revision-1',
    accountId: 'brk-1',
    measure: 'value',
    method: 'recorded',
    currency: 'USD',
    points: [],
    unconverted: false,
    ...overrides,
  };
}

function mockHistory(body: unknown, ok = true) {
  global.fetch = jest.fn(async () => ({ ok, json: async () => body }) as Response) as unknown as typeof fetch;
}

describe('ranges', () => {
  const year = daily('2025-11-21', 366, index => 1000 + index);

  it('offers only the ranges the history reaches past', () => {
    expect(availableRanges(year)).toEqual(['1M', '3M', '6M', 'All']);
    expect(availableRanges(daily('2026-10-01', 52, () => 1))).toEqual(['1M', 'All']);
    expect(availableRanges(daily('2026-11-10', 12, () => 1))).toEqual(['All']);
    expect(availableRanges([])).toEqual(['All']);
  });

  it('does not offer a range that would hold a single point', () => {
    const sparse = [
      { date: '2026-03-01', value: 1 },
      { date: '2026-07-01', value: 2 },
      { date: '2026-11-21', value: 3 },
    ];
    // 1M and 3M each reach past the history but hold only its last point.
    expect(availableRanges(sparse)).toEqual(['6M', 'All']);
  });

  it('counts a range back from the last day', () => {
    const shown = pointsInRange(year, '1M');
    expect(shown[0].date).toBe('2026-10-22');
    expect(shown[shown.length - 1].date).toBe('2026-11-21');
  });
});

describe('formatAxisMoney', () => {
  it('keeps each tick exact to the dollar, as short as it can', () => {
    expect(formatAxisMoney(18000)).toBe('$18K');
    expect(formatAxisMoney(18500)).toBe('$18.5K');
    expect(formatAxisMoney(21850)).toBe('$21.85K');
    expect(formatAxisMoney(21825)).toBe('$21,825');
    expect(formatAxisMoney(1250000)).toBe('$1.25M');
    expect(formatAxisMoney(450)).toBe('$450');
    expect(formatAxisMoney(-2500)).toBe('−$2.5K');
    expect(formatAxisMoney(0)).toBe('$0');
  });
});

describe('describeChange', () => {
  const points = (from: number, to: number) => [
    { date: '2026-08-21', value: from },
    { date: '2026-11-21', value: to },
  ];

  it('signs a change in value or balance', () => {
    expect(describeChange(points(20000, 22127), 'value')).toEqual({ text: '+$2,127 since Aug 21, 2026', tone: 'up' });
    expect(describeChange(points(1500, 1200), 'balance')).toEqual({ text: '−$300 since Aug 21, 2026', tone: 'down' });
  });

  it('says which way a debt moved, owing less being the good direction', () => {
    expect(describeChange(points(800, 500), 'owed')).toEqual({ text: 'Down $300 since Aug 21, 2026', tone: 'up' });
    expect(describeChange(points(500, 800), 'owed')).toEqual({ text: 'Up $300 since Aug 21, 2026', tone: 'down' });
  });

  it('has nothing to say about one point', () => {
    expect(describeChange([{ date: '2026-11-21', value: 1 }], 'value')).toBeNull();
    expect(describeChange(points(100.2, 100.4), 'value')?.text).toBe('No change since Aug 21, 2026');
  });
});

describe('describeSource', () => {
  it('says why a balance in another currency is not charted, rather than that nothing is recorded yet', () => {
    expect(describeSource(history({ unconverted: true }), { institution: 'Wise', source: 'plaid' }))
      .toBe("This account's balance isn't reported in USD, and Linc doesn't convert currencies, so it can't chart this account.");
  });

  it('says a rebuilt series came from posted transactions', () => {
    expect(describeSource(history({ method: 'transactions', points: points2() }), { institution: 'Chase', source: 'plaid' }))
      .toMatch(/^Rebuilt from this account's posted transactions, working back from the balance Chase reported/);
  });

  it('says a recorded history has only just started', () => {
    expect(describeSource(history({ points: [{ date: '2026-11-21', value: 1 }] }), brokerage))
      .toBe('Linc has one recorded value for this account so far, from Nov 21, 2026. The chart fills in as Betterment reports new values.');
    expect(describeSource(history({ points: [] }), brokerage))
      .toBe("Linc records this account's value each time Betterment reports it. Nothing has been recorded yet.");
  });

  it('says a hand-entered balance is the user\'s own', () => {
    expect(describeSource(history({ points: points2() }), { source: 'manual' }))
      .toBe('The balance you entered, each time you changed it, since Nov 20, 2026.');
  });

  function points2() {
    return [{ date: '2026-11-20', value: 1 }, { date: '2026-11-21', value: 2 }];
  }
});

describe('AccountValueChart', () => {
  beforeEach(() => localStorage.setItem('auth_token', 'token'));
  afterEach(() => jest.resetAllMocks());

  it('loads the account history and shows the latest value and its change', async () => {
    mockHistory(history({ points: daily('2026-08-21', 93, index => 20000 + index * 23) }));

    render(<AccountValueChart account={brokerage} accountId="brk-1" revisionId="revision-1" />);

    expect(await screen.findByRole('heading', { name: 'Value over time' })).toBeInTheDocument();
    expect(screen.getByText('$22,116')).toBeInTheDocument();
    expect(screen.getByText('+$2,116 since Aug 21, 2026')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Value over time: \$20,000 on Aug 21, 2026 to \$22,116 on Nov 21, 2026/ }))
      .toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/finances/accounts/brk-1/history',
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('narrows the chart to a range', async () => {
    mockHistory(history({ points: daily('2026-08-21', 93, index => 20000 + index * 23) }));
    render(<AccountValueChart account={brokerage} accountId="brk-1" revisionId="revision-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '1M' }));

    expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('+$690 since Oct 22, 2026')).toBeInTheDocument();
  });

  it('draws no line through a single recorded value', async () => {
    mockHistory(history({ points: [{ date: '2026-11-21', value: 22127 }] }));
    render(<AccountValueChart account={brokerage} accountId="brk-1" revisionId="revision-1" />);

    expect(await screen.findByText(/Linc has one recorded value for this account so far/)).toBeInTheDocument();
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Time range' })).not.toBeInTheDocument();
  });

  it('says so when the history cannot load', async () => {
    mockHistory({ error: 'nope' }, false);
    render(<AccountValueChart account={brokerage} accountId="brk-1" revisionId="revision-1" />);

    expect(await screen.findByText("This account's value history is unavailable right now.")).toBeInTheDocument();
  });
});
