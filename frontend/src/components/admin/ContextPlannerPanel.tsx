'use client';

import { useEffect, useMemo, useState } from 'react';

interface ContextPack {
  id: string;
  label: string;
  description: string;
  cost: 'local' | 'computed' | 'external';
  dependencies: string[];
}

interface ScenarioCalculatorManifest {
  id: string;
  version: number;
  label: string;
  description: string;
  requiredPacks: string[];
  supportedOverrides: Array<{ id: string; label: string }>;
  defaults: Array<{ id: string; value: string | number | boolean }>;
  outputs: Array<{ id: string; label: string; unit: string }>;
}

interface PlannerTurn {
  question: string;
  answer: string;
}

interface RetirementScenarioVariant {
  type: string;
  annualRate?: number;
  source?: string;
  overrides?: Record<string, unknown> & { sources?: Record<string, string> };
}

interface PlannerResponse {
  plan: {
    source: 'context_planner' | 'fallback_all';
    requestedPacks: string[];
    selectedPacks: string[];
    needsSecondaryValidation: boolean;
    retirementInputs?: Record<string, unknown> & { sources?: Record<string, string> };
    scenarioPlans?: Record<string, unknown> & {
      retirement?: {
        requested: true;
        primary: RetirementScenarioVariant;
        comparison?: RetirementScenarioVariant;
      };
    };
    /** Compatibility with a backend deployed before registry-keyed planning. */
    retirementScenario?: {
      requested: true;
      primary: RetirementScenarioVariant;
      comparison?: RetirementScenarioVariant;
    };
    summary: string;
    model?: string;
    durationMs: number;
  };
  packs: ContextPack[];
  calculators?: ScenarioCalculatorManifest[];
}

const EMPTY_TURN: PlannerTurn = { question: '', answer: '' };

export default function ContextPlannerPanel({
  apiUrl,
  getAuthHeaders,
}: {
  apiUrl: string | undefined;
  getAuthHeaders: () => Record<string, string>;
}) {
  const [packs, setPacks] = useState<ContextPack[]>([]);
  const [calculators, setCalculators] = useState<ScenarioCalculatorManifest[]>([]);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<PlannerTurn[]>([{ ...EMPTY_TURN }]);
  const [result, setResult] = useState<PlannerResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void fetch(`${apiUrl}/admin/ai/context-packs`, { headers: getAuthHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load context-pack definitions');
        const body = await response.json();
        setPacks(body.packs ?? []);
        setCalculators(body.calculators ?? []);
      })
      .catch(() => setStatus('Failed to load context-pack definitions.'));
    // Authentication headers are intentionally read once when this panel mounts,
    // matching the other admin settings panels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  const selected = useMemo(
    () => new Set(result?.plan.selectedPacks ?? []),
    [result]
  );
  const requested = useMemo(
    () => new Set(result?.plan.requestedPacks ?? []),
    [result]
  );

  const updateTurn = (index: number, field: keyof PlannerTurn, value: string) => {
    setTurns((current) => current.map((turn, turnIndex) =>
      turnIndex === index ? { ...turn, [field]: value } : turn
    ));
  };

  const runPlanner = async () => {
    if (!question.trim()) return;
    setRunning(true);
    setStatus(null);
    try {
      const response = await fetch(`${apiUrl}/admin/ai/context-planner-preview`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          question: question.trim(),
          turns: turns
            .filter((turn) => turn.question.trim())
            .map((turn) => ({ question: turn.question.trim(), answer: turn.answer.trim() })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Context planner failed');
      setResult(body);
      setPacks(body.packs ?? packs);
      setCalculators(body.calculators ?? calculators);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Context planner failed');
    } finally {
      setRunning(false);
    }
  };

  const retirementInputs = Object.entries(result?.plan.retirementInputs ?? {})
    .filter(([key, value]) => key !== 'sources' && value !== undefined && value !== null);
  const scenarioPlans = result?.plan.scenarioPlans
    ?? (result?.plan.retirementScenario
      ? { retirement: result.plan.retirementScenario }
      : {});
  const retirementScenario = scenarioPlans.retirement as PlannerResponse['plan']['retirementScenario'];
  const otherScenarioPlans = Object.entries(scenarioPlans)
    .filter(([id]) => id !== 'retirement');
  const formatPolicy = (policy: { type: string; annualRate?: number } | undefined) => {
    if (!policy) return 'Current baseline';
    if (policy.type === 'fixed_growth') {
      return `${policy.annualRate === undefined ? 'Default' : Number((policy.annualRate * 100).toFixed(4)) + '%'} annual growth`;
    }
    if (policy.type === 'flat_nominal') return 'Flat nominal withdrawals';
    if (policy.type === 'historical_cpi') return 'Historical CPI-linked withdrawals';
    return policy.type;
  };
  const formatOverrides = (variant: RetirementScenarioVariant | undefined) =>
    Object.entries(variant?.overrides ?? {})
      .filter(([key, value]) => key !== 'sources' && value !== undefined && value !== null)
      .map(([key, value]) => `${key}: ${String(value)}`);

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Context planner</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-400">
            The preflight model reads the complete active decision and selects optional data by meaning.
            The primary analysis model can then add packs through its constrained data tool before answering.
          </p>
        </div>
        {result && (
          <div className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-right">
            <div className="text-lg font-semibold text-white">
              {result.plan.selectedPacks.length} of {packs.length}
            </div>
            <div className="text-xs text-gray-500">packs selected</div>
          </div>
        )}
      </div>

      {status && <div className="mt-4 rounded border border-red-700 bg-red-900/40 p-3 text-sm text-red-200">{status}</div>}

      <div className="mt-5 rounded-lg border border-gray-700 bg-gray-900 p-4">
        <label className="block text-sm font-medium text-gray-200" htmlFor="planner-question">
          Current user message
        </label>
        <textarea
          id="planner-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          placeholder="e.g. What if we used the second option instead?"
          className="mt-2 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
        />

        <div className="mt-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-200">Earlier turns in this decision</div>
            <div className="text-xs text-gray-500">Oldest first. Answers matter for short replies and references.</div>
          </div>
          <button
            type="button"
            onClick={() => setTurns((current) => [...current, { ...EMPTY_TURN }])}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Add turn
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {turns.map((turn, index) => (
            <div key={index} className="rounded border border-gray-800 bg-gray-950/40 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span>Turn {index + 1}</span>
                {turns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setTurns((current) => current.filter((_, turnIndex) => turnIndex !== index))}
                    className="text-gray-500 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                aria-label={`Turn ${index + 1} user question`}
                value={turn.question}
                onChange={(event) => updateTurn(index, 'question', event.target.value)}
                placeholder="User question"
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
              />
              <textarea
                aria-label={`Turn ${index + 1} assistant answer`}
                value={turn.answer}
                onChange={(event) => updateTurn(index, 'answer', event.target.value)}
                rows={2}
                placeholder="Assistant answer"
                className="mt-2 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={runPlanner}
          disabled={running || !question.trim()}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
        >
          {running ? 'Reading decision…' : 'Run context planner'}
        </button>
      </div>

      {result && (
        <div className="mt-5">
          <div className={`rounded border p-4 ${
            result.plan.source === 'fallback_all'
              ? 'border-yellow-700 bg-yellow-900/20'
              : 'border-green-800 bg-green-950/20'
          }`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium text-white">
                {result.plan.source === 'fallback_all' ? 'Planner fallback used' : 'Semantic plan completed'}
              </span>
              <span className="text-xs text-gray-400">{result.plan.model ?? 'fallback'} · {result.plan.durationMs} ms</span>
              <span className="text-xs text-gray-400">
                {result.plan.needsSecondaryValidation ? 'Second review requested' : 'Standard validation'}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-300">{result.plan.summary || 'No planner summary supplied.'}</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {packs.map((pack) => {
              const isSelected = selected.has(pack.id);
              const dependencyAdded = isSelected && !requested.has(pack.id);
              return (
                <div key={pack.id} className={`rounded border p-3 ${
                  isSelected ? 'border-green-800 bg-green-950/20' : 'border-gray-700 bg-gray-900'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-gray-100">{pack.label}</div>
                    <span className={`rounded px-2 py-0.5 text-[11px] ${
                      isSelected ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'
                    }`}>
                      {dependencyAdded ? 'dependency' : isSelected ? 'selected' : 'not needed'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-400">{pack.description}</p>
                  <div className="mt-2 text-[11px] uppercase tracking-wide text-gray-600">{pack.cost}</div>
                </div>
              );
            })}
          </div>

          {calculators.length > 0 && (
            <div className="mt-4 rounded border border-gray-700 bg-gray-900 p-3">
              <div className="text-sm font-medium text-gray-200">Calculator registry</div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {calculators.map((calculator) => (
                  <div key={calculator.id} className="rounded border border-gray-800 bg-gray-950/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-gray-100">{calculator.label}</span>
                      <span className="text-xs text-gray-500">v{calculator.version}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-400">{calculator.description}</p>
                    <div className="mt-2 text-xs text-gray-400">
                      Required packs: {calculator.requiredPacks.join(', ') || 'none'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {calculator.supportedOverrides.map((override) => (
                        <span key={override.id} className="rounded bg-gray-800 px-2 py-1 text-[11px] text-gray-300">
                          {override.label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">
                      {calculator.outputs.length} outputs · {calculator.defaults.length} disclosed defaults
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {retirementInputs.length > 0 && (
            <div className="mt-4 rounded border border-gray-700 bg-gray-900 p-3">
              <div className="text-sm font-medium text-gray-200">Retirement inputs read from the decision</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {retirementInputs.map(([key, value]) => (
                  <span key={key} className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {retirementScenario && (
            <div className="mt-4 rounded border border-blue-800 bg-blue-950/20 p-3">
              <div className="text-sm font-medium text-blue-100">Retirement scenario request</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-blue-900/60 px-2 py-1 text-blue-200">
                  Run: {formatPolicy(retirementScenario.primary)}
                </span>
                <span className="rounded bg-gray-800 px-2 py-1 text-gray-300">
                  Compare with: {formatPolicy(retirementScenario.comparison)}
                </span>
              </div>
              {(retirementScenario.primary.source || retirementScenario.comparison?.source) && (
                <p className="mt-2 text-xs text-gray-400">
                  Source wording: {[retirementScenario.primary.source, retirementScenario.comparison?.source]
                    .filter(Boolean).join(' · ')}
                </p>
              )}
              {[retirementScenario.primary, retirementScenario.comparison].map((variant, index) => {
                const overrides = formatOverrides(variant);
                if (overrides.length === 0) return null;
                return (
                  <div key={index} className="mt-2 flex flex-wrap gap-2 text-xs text-blue-200">
                    <span className="text-gray-500">{index === 0 ? 'Run overrides:' : 'Comparison overrides:'}</span>
                    {overrides.map((override) => (
                      <span key={override} className="rounded bg-blue-900/40 px-2 py-1">{override}</span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {otherScenarioPlans.map(([id, plan]) => (
            <div key={id} className="mt-4 rounded border border-blue-800 bg-blue-950/20 p-3">
              <div className="text-sm font-medium text-blue-100">
                {calculators.find((calculator) => calculator.id === id)?.label ?? id}
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-blue-200">
                {JSON.stringify(plan, null, 2)}
              </pre>
            </div>
          ))}

          <p className="mt-3 text-xs text-gray-500">
            This tester shows preflight selection. In a live answer, the primary model sees the available fact labels and may add packs before it writes anything.
          </p>
        </div>
      )}
    </div>
  );
}
