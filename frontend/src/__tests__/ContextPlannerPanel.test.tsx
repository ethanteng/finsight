import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContextPlannerPanel from '@/components/admin/ContextPlannerPanel';

const PACKS = [
  { id: 'account_details', label: 'Account details', description: 'Individual balances.', cost: 'local', dependencies: [] },
  { id: 'investment_details', label: 'Investment details', description: 'Individual holdings.', cost: 'local', dependencies: ['account_details'] },
];
const CALCULATORS = [{
  id: 'retirement',
  version: 2,
  label: 'Retirement scenarios',
  description: 'Compare retirement assumptions.',
  requiredPacks: ['retirement_analysis'],
  supportedOverrides: [{ id: 'retirement_age', label: 'Retirement age' }],
  defaults: [{ id: 'annual_contribution_amount', value: 0 }],
  outputs: [{ id: 'survival_rate', label: 'Survival rate', unit: 'percent' }],
}];

describe('ContextPlannerPanel', () => {
  it('tests a full Q&A decision and explains dependency-added packs', async () => {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            packs: PACKS,
            calculators: CALCULATORS,
            plan: {
              source: 'context_planner',
              requestedPacks: ['investment_details'],
              selectedPacks: ['account_details', 'investment_details'],
              needsSecondaryValidation: true,
              searchQueries: [{
                query: 'current Federal Reserve interest rate',
                purpose: 'rate',
                freshness: 'pm',
              }],
              retirementInputs: { sources: {} },
              scenarioPlans: {
                retirement: {
                  requested: true,
                  primary: {
                    type: 'fixed_growth',
                    annualRate: 0.03,
                    source: '3% bump',
                    overrides: { retirementAge: 65, annualContributionAmount: 12_000, sources: {} },
                  },
                  comparison: { type: 'flat_nominal', source: 'flat version' },
                },
              },
              summary: 'The follow-up continues a portfolio comparison.',
              model: 'gpt-test',
              durationMs: 40,
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ packs: PACKS, calculators: CALCULATORS }) } as Response;
    }) as typeof fetch;

    render(<ContextPlannerPanel apiUrl="https://api.test" getAuthHeaders={() => ({})} />);
    fireEvent.change(screen.getByLabelText('Current user message'), { target: { value: 'What about that one?' } });
    fireEvent.change(screen.getByLabelText('Turn 1 user question'), { target: { value: 'Compare my investments.' } });
    fireEvent.change(screen.getByLabelText('Turn 1 assistant answer'), { target: { value: 'Which allocation do you mean?' } });
    fireEvent.click(screen.getByText('Run context planner'));

    expect(await screen.findByText('Semantic plan completed')).toBeInTheDocument();
    expect(screen.getByText('The follow-up continues a portfolio comparison.')).toBeInTheDocument();
    expect(screen.getByText('dependency')).toBeInTheDocument();
    expect(screen.getByText('selected')).toBeInTheDocument();
    expect(screen.getByText('Planned public searches')).toBeInTheDocument();
    expect(screen.getByText('current Federal Reserve interest rate')).toBeInTheDocument();
    expect(screen.getByText('rate · pm')).toBeInTheDocument();
    expect(screen.getByText('Retirement scenario request')).toBeInTheDocument();
    expect(screen.getByText('Calculator registry')).toBeInTheDocument();
    expect(screen.getByText('Retirement scenarios')).toBeInTheDocument();
    expect(screen.getByText('Retirement age')).toBeInTheDocument();
    expect(screen.getByText('Run: 3% annual growth')).toBeInTheDocument();
    expect(screen.getByText('Compare with: Flat nominal withdrawals')).toBeInTheDocument();
    expect(screen.getByText('retirementAge: 65')).toBeInTheDocument();
    expect(screen.getByText('annualContributionAmount: 12000')).toBeInTheDocument();
    await waitFor(() => {
      const post = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST');
      const body = JSON.parse(post[1].body);
      expect(body.turns).toEqual([{ question: 'Compare my investments.', answer: 'Which allocation do you mean?' }]);
    });
  });
});
