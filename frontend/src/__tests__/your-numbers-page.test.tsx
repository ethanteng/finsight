import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import YourNumbersPageClient from '@/app/your-numbers/YourNumbersPageClient';

const push = jest.fn();
// One router for every render, as Next gives: a new one each time would make the
// page reload on every render and hide what happens when a load fails.
const mockRouter = { push };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
jest.mock('@/components/authenticated/AuthenticatedPageHeader', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <header>{title}</header>,
}));
jest.mock('@/components/ManualAccountList', () => ({
  __esModule: true,
  default: ({ accounts }: { accounts: Array<{ name: string }> }) => <div>Manual accounts: {accounts.map((account) => account.name).join(', ') || 'none'}</div>,
}));

type Routes = Record<string, unknown>;

function serve(routes: Routes) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname;
    const body = routes[`${method} ${path}`];
    if (body === undefined) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    return Promise.resolve({ ok: true, status: 200, json: async () => (typeof body === 'function' ? body(init) : body) });
  });
}

const NOTHING_LINKED = { investments: null, cash: null, debt: null, incomeFromTransactions: false, spendingFromTransactions: false };

describe('Your numbers', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'token');
    push.mockReset();
  });

  it('shows what is saved, with when, and marks what is still needed', async () => {
    serve({
      'GET /api/stated-figures': {
        figures: { retirementAge: { value: 60, savedAt: '2026-09-14T10:00:00.000Z', source: 'answer' } },
        coverage: NOTHING_LINKED,
      },
      'GET /api/manual-accounts': { data: [] },
      'GET /api/finances/overrides': { monthlyIncome: null, monthlyExpense: null },
      'GET /profile': { memory: {} },
    });
    render(<YourNumbersPageClient />);

    expect(await screen.findByLabelText('Age you plan to retire')).toHaveValue('60');
    expect(screen.getByText('Saved Sep 14, 2026 from an answer')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Still needed for most decisions: your age, what you have invested, what retirement will cost, what you spend a month.'
    );
    expect(screen.getByText('Needed for retirement answers:')).toBeInTheDocument();
  });

  it('asks for nothing that linked accounts already cover', async () => {
    serve({
      'GET /api/stated-figures': {
        figures: { annualRetirementSpending: { value: 80000, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' } },
        coverage: { investments: 'linked', cash: 'linked', debt: null, incomeFromTransactions: true, spendingFromTransactions: true },
      },
      'GET /api/manual-accounts': { data: [] },
      'GET /api/finances/overrides': { monthlyIncome: null, monthlyExpense: null },
      'GET /profile': { memory: { age: 38 } },
    });
    render(<YourNumbersPageClient />);

    expect(await screen.findByLabelText(/Your age/)).toHaveValue('38');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText('Needed')).not.toBeInTheDocument();
    expect(screen.getByText(/Your linked investment accounts already give Linc your balances/)).toBeInTheDocument();
  });

  it('saves only the plan figures that changed, and clears a blanked one', async () => {
    const saved = jest.fn();
    serve({
      'GET /api/stated-figures': {
        figures: {
          retirementAge: { value: 60, savedAt: '2026-09-14T10:00:00.000Z', source: 'answer' },
          planThroughAge: { value: 95, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
        },
        coverage: NOTHING_LINKED,
      },
      'GET /api/manual-accounts': { data: [] },
      'GET /api/finances/overrides': { monthlyIncome: null, monthlyExpense: null },
      'GET /profile': { memory: {} },
      'PUT /api/stated-figures': (init: RequestInit) => {
        saved(JSON.parse(String(init.body)));
        return { figures: {} };
      },
    });
    render(<YourNumbersPageClient />);

    fireEvent.change(await screen.findByLabelText(/What you expect to spend a year in retirement/), { target: { value: '80k' } });
    fireEvent.change(screen.getByLabelText('Plan through age'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));

    await waitFor(() => expect(saved).toHaveBeenCalledWith({
      figures: { annualRetirementSpending: 80000, planThroughAge: null },
      source: 'page',
    }));
    expect(await screen.findByText('Saved. Linc will plan with these from your next question.')).toBeInTheDocument();
  });

  it('will not save a figure outside what Linc accepts', async () => {
    serve({
      'GET /api/stated-figures': { figures: {}, coverage: NOTHING_LINKED },
      'GET /api/manual-accounts': { data: [] },
      'GET /api/finances/overrides': { monthlyIncome: null, monthlyExpense: null },
      'GET /profile': { memory: {} },
    });
    render(<YourNumbersPageClient />);

    fireEvent.change(await screen.findByLabelText('Age you plan to retire'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));

    expect(await screen.findByText('Enter a value from 30 to 95.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'PUT' }));
  });

  it('saves the age into what Linc remembers, keeping everything else there', async () => {
    const saved = jest.fn();
    serve({
      'GET /api/stated-figures': { figures: {}, coverage: NOTHING_LINKED },
      'GET /api/manual-accounts': { data: [] },
      'GET /api/finances/overrides': { monthlyIncome: null, monthlyExpense: null },
      'GET /profile': { memory: { city: 'Portland' } },
      'PUT /profile': (init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        saved(body);
        return { memory: body.memory };
      },
    });
    render(<YourNumbersPageClient />);

    const about = (await screen.findByRole('heading', { name: 'About you' })).closest('section')!;
    fireEvent.change(within(about).getByLabelText(/Your age/), { target: { value: '41' } });
    fireEvent.click(within(about).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved).toHaveBeenCalledWith({ memory: { city: 'Portland', age: 41 } }));
  });

  it('reads what Linc remembers again before saving an age when it could not load', async () => {
    const saved = jest.fn();
    serve({
      'GET /api/stated-figures': { figures: {}, coverage: NOTHING_LINKED },
      'GET /api/manual-accounts': { data: [] },
      'GET /api/finances/overrides': { monthlyIncome: null, monthlyExpense: null },
      'GET /profile': { memory: { city: 'Portland' } },
      'PUT /profile': (init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        saved(body);
        return { memory: body.memory };
      },
    });
    const served = global.fetch as jest.Mock;
    let profileReads = 0;
    global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      const firstProfileRead = new URL(url).pathname === '/profile' && (init?.method ?? 'GET') === 'GET' && profileReads++ === 0;
      return firstProfileRead ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) }) : served(url, init);
    });
    render(<YourNumbersPageClient />);

    const about = (await screen.findByRole('heading', { name: 'About you' })).closest('section')!;
    fireEvent.change(within(about).getByLabelText(/Your age/), { target: { value: '41' } });
    fireEvent.click(within(about).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved).toHaveBeenCalledWith({ memory: { city: 'Portland', age: 41 } }));
  });

  it('says so, and saves nothing, when what Linc remembers still cannot be read', async () => {
    serve({
      'GET /api/stated-figures': { figures: {}, coverage: NOTHING_LINKED },
      'GET /api/manual-accounts': { data: [] },
      'GET /api/finances/overrides': { monthlyIncome: null, monthlyExpense: null },
    });
    render(<YourNumbersPageClient />);

    const about = (await screen.findByRole('heading', { name: 'About you' })).closest('section')!;
    fireEvent.change(within(about).getByLabelText(/Your age/), { target: { value: '41' } });
    fireEvent.click(within(about).getByRole('button', { name: 'Save' }));

    expect(await within(about).findByText(/could not be loaded, so your age was not saved/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'PUT' }));
  });

  it('does not clear a saved age when Save is clicked on an empty field after profile load failed', async () => {
    const saved = jest.fn();
    serve({
      'GET /api/stated-figures': { figures: {}, coverage: NOTHING_LINKED },
      'GET /api/manual-accounts': { data: [] },
      'GET /api/finances/overrides': { monthlyIncome: null, monthlyExpense: null },
      'GET /profile': { memory: { city: 'Portland', age: 41 } },
      'PUT /profile': (init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        saved(body);
        return { memory: body.memory };
      },
    });
    const served = global.fetch as jest.Mock;
    let profileReads = 0;
    global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      const firstProfileRead = new URL(url).pathname === '/profile' && (init?.method ?? 'GET') === 'GET' && profileReads++ === 0;
      return firstProfileRead ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) }) : served(url, init);
    });
    render(<YourNumbersPageClient />);

    const about = (await screen.findByRole('heading', { name: 'About you' })).closest('section')!;
    expect(within(about).getByLabelText(/Your age/)).toHaveValue('');
    fireEvent.click(within(about).getByRole('button', { name: 'Save' }));

    expect(await within(about).findByText('Nothing has changed.')).toBeInTheDocument();
    await waitFor(() => expect(within(about).getByLabelText(/Your age/)).toHaveValue('41'));
    expect(saved).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to sign in', async () => {
    localStorage.removeItem('auth_token');
    serve({});
    render(<YourNumbersPageClient />);
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });
});
