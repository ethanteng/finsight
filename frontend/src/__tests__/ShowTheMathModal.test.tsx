import { fireEvent, render, screen } from '@testing-library/react';
import { ShowTheMathContent } from '@/components/ShowTheMathModal';

describe('ShowTheMathContent', () => {
  it('explains when a legacy payload has no evidence manifest', () => {
    render(<ShowTheMathContent data={{}} />);

    expect(screen.getByText(/created before traceable evidence manifests were available/i)).toBeInTheDocument();
  });

  it('surfaces registry-keyed scenario planning and calculation evidence', () => {
    render(<ShowTheMathContent data={{
      evidenceManifest: {
        version: 1,
        generatedAt: '2026-08-17T00:00:00.000Z',
        snapshot: {},
        facts: [],
        contextPlanning: {
          source: 'context_planner',
          scenarios: {
            retirement: { requested: true, primary: { type: 'fixed_growth', annualRate: 0.03 } },
          },
        },
        scenarioExecutions: {
          retirement: {
            calculator: 'retirement',
            status: 'completed',
            durationMs: 42,
          },
        },
        modelCalls: [],
        timings: { contextGatherMs: 1, promptBuildMs: 1, totalMs: 2 },
        validation: { deterministic: { valid: true, issues: [] } },
        evidenceRefs: { tickers: [], retirementAnalysis: true, marketContext: false },
      },
    }} />);

    fireEvent.click(screen.getByText('Context planning'));
    fireEvent.click(screen.getByText('Scenario calculations'));

    expect(screen.getByText(/fixed_growth/)).toBeInTheDocument();
    expect(screen.getByText(/"calculator": "retirement"/)).toBeInTheDocument();
  });
});
