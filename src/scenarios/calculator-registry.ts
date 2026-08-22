import type { FinancialContextSnapshot } from '../openai/types';
import type { ContextPackId } from '../openai/context-packs';
import type { CanonicalFact } from '../openai/canonical-facts';
import { retirementScenarioCalculator } from './retirement-scenario';
import { homeAffordabilityScenarioCalculator } from './home-affordability-scenario';

export type ScenarioOverrideValueType =
  | 'currency'
  | 'percentage'
  | 'age'
  | 'months'
  | 'years'
  | 'number'
  | 'boolean'
  | 'enum';
export type ScenarioOutputUnit = 'usd' | 'percent' | 'months' | 'years' | 'count' | 'ratio';

export interface ScenarioOverrideDefinition {
  id: string;
  label: string;
  description: string;
  valueType: ScenarioOverrideValueType;
  minimum?: number;
  maximum?: number;
  options?: readonly string[];
}

export interface ScenarioDefaultDefinition {
  id: string;
  value: string | number | boolean;
  description: string;
  appliesWhen?: string;
}

export interface ScenarioOutputDefinition {
  id: string;
  label: string;
  unit: ScenarioOutputUnit;
  scope: 'variant' | 'comparison';
  description: string;
}

export interface ScenarioCalculatorManifest {
  id: string;
  version: number;
  label: string;
  description: string;
  requiredPacks: readonly ContextPackId[];
  supportedOverrides: readonly ScenarioOverrideDefinition[];
  defaults: readonly ScenarioDefaultDefinition[];
  outputs: readonly ScenarioOutputDefinition[];
}

export interface ScenarioCalculatorDefinition<
  Plan,
  Execution extends ScenarioExecutionBase,
  Evidence extends ScenarioExecutionBase,
>
  extends ScenarioCalculatorManifest {
  planner: {
    jsonSchema: Readonly<Record<string, unknown>>;
    instructions: string;
    parsePlan(value: unknown): Plan | undefined;
  };
  execution: {
    progressMessage: string;
    failureMessage: string;
  };
  execute(snapshot: FinancialContextSnapshot, plan: Plan): Promise<Execution>;
  unavailable(startedAt: number, reason: string): Execution;
  compactEvidence(execution: Execution): Evidence;
  canonicalFacts(execution: Execution): CanonicalFact[];
  describeAssumptions(execution: Execution): string | null;
}

type AnyScenarioCalculator = ScenarioCalculatorDefinition<any, any, any>;

export interface ScenarioExecutionBase {
  version: number;
  calculator: string;
  status: 'completed' | 'unavailable';
  computedAt: string;
  durationMs: number;
  reason?: string;
}

export type ScenarioPlanRecord = Record<string, unknown>;
export type ScenarioExecutionRecord = Record<string, ScenarioExecutionBase>;
export type ScenarioEvidenceRecord = Record<string, ScenarioExecutionBase>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function freezeManifest(definition: AnyScenarioCalculator): ScenarioCalculatorManifest {
  return Object.freeze({
    id: definition.id,
    version: definition.version,
    label: definition.label,
    description: definition.description,
    requiredPacks: Object.freeze([...definition.requiredPacks]),
    supportedOverrides: Object.freeze(definition.supportedOverrides.map((item) => Object.freeze({
      ...item,
      ...(item.options && { options: Object.freeze([...item.options]) }),
    }))),
    defaults: Object.freeze(definition.defaults.map((item) => Object.freeze({ ...item }))),
    outputs: Object.freeze(definition.outputs.map((item) => Object.freeze({ ...item }))),
  });
}

/**
 * Application-owned catalog of deterministic scenario calculators.
 *
 * Model-facing planning can select a registered calculator and propose values,
 * but the registry remains the authority for packs, accepted overrides,
 * defaults, execution, and the output contract.
 */
export class ScenarioCalculatorRegistry {
  private readonly calculators = new Map<string, AnyScenarioCalculator>();

  constructor(definitions: readonly AnyScenarioCalculator[]) {
    for (const definition of definitions) {
      if (this.calculators.has(definition.id)) {
        throw new Error(`Duplicate scenario calculator id: ${definition.id}`);
      }
      this.calculators.set(definition.id, definition);
    }
  }

  ids(): string[] {
    return [...this.calculators.keys()];
  }

  manifests(): ScenarioCalculatorManifest[] {
    return [...this.calculators.values()].map(freezeManifest);
  }

  plannerJsonSchema(): Readonly<Record<string, unknown>> {
    const ids = this.ids();
    return {
      type: 'object',
      additionalProperties: false,
      required: ids,
      properties: Object.fromEntries(
        ids.map((id) => [id, this.require(id).planner.jsonSchema])
      ),
    };
  }

  plannerInstructions(): string {
    return [...this.calculators.values()]
      .map((definition) => `${definition.label} (key: ${definition.id}):\n${definition.planner.instructions}`)
      .join('\n\n');
  }

  parsePlans(value: unknown): ScenarioPlanRecord {
    const record = asRecord(value);
    const plans: ScenarioPlanRecord = {};
    for (const [id, definition] of this.calculators) {
      const plan = definition.planner.parsePlan(record[id]);
      if (plan !== undefined) plans[id] = plan;
    }
    return plans;
  }

  mergePlans(primary: ScenarioPlanRecord, fallback: ScenarioPlanRecord): ScenarioPlanRecord {
    return Object.fromEntries(this.ids().flatMap((id) => {
      const plan = primary[id] ?? fallback[id];
      return plan === undefined ? [] : [[id, plan]];
    }));
  }

  getPlan<Plan>(plans: ScenarioPlanRecord | undefined, id: string): Plan | undefined {
    return plans?.[id] as Plan | undefined;
  }

  requiredPacksForPlans(plans: ScenarioPlanRecord): ContextPackId[] {
    // Only registered calculator ids are authoritative. Ignore unknown keys so a
    // malformed plan object cannot take down pack selection with require().
    return Array.from(new Set(
      this.ids().flatMap((id) => (plans[id] === undefined ? [] : this.requiredPacks(id)))
    ));
  }

  require<Plan, Execution extends ScenarioExecutionBase, Evidence extends ScenarioExecutionBase>(
    id: string
  ): ScenarioCalculatorDefinition<Plan, Execution, Evidence> {
    const definition = this.calculators.get(id);
    if (!definition) throw new Error(`Unknown scenario calculator: ${id}`);
    return definition;
  }

  parsePlan<Plan>(id: string, value: unknown): Plan | undefined {
    return this.require<Plan, ScenarioExecutionBase, ScenarioExecutionBase>(id).planner.parsePlan(value);
  }

  requiredPacks(id: string): ContextPackId[] {
    return [...this.require(id).requiredPacks];
  }

  async execute<Plan, Execution extends ScenarioExecutionBase>(
    id: string,
    snapshot: FinancialContextSnapshot,
    plan: Plan
  ): Promise<Execution> {
    return this.require<Plan, Execution, ScenarioExecutionBase>(id).execute(snapshot, plan);
  }

  async executePlans(
    snapshot: FinancialContextSnapshot,
    plans: ScenarioPlanRecord,
    supplied: ScenarioExecutionRecord = {},
    onProgress?: (message: string) => void
  ): Promise<ScenarioExecutionRecord> {
    const executions: ScenarioExecutionRecord = {};
    for (const id of this.ids()) {
      const plan = plans[id];
      if (plan === undefined) continue;
      const definition = this.require<unknown, ScenarioExecutionBase, ScenarioExecutionBase>(id);
      const suppliedExecution = supplied[id];
      if (suppliedExecution) {
        executions[id] = suppliedExecution;
        continue;
      }
      onProgress?.(definition.execution.progressMessage);
      const startedAt = Date.now();
      try {
        executions[id] = await this.execute(id, snapshot, plan);
      } catch (error) {
        console.error(`Ask Linc: ${id} scenario execution failed:`, error);
        executions[id] = definition.unavailable(startedAt, definition.execution.failureMessage);
      }
    }
    return executions;
  }

  compactEvidence<Execution extends ScenarioExecutionBase, Evidence extends ScenarioExecutionBase>(id: string, execution: Execution): Evidence {
    return this.require<unknown, Execution, Evidence>(id).compactEvidence(execution);
  }

  compactEvidenceRecord(executions: ScenarioExecutionRecord): ScenarioEvidenceRecord {
    return Object.fromEntries(this.ids().flatMap((id) => {
      const execution = executions[id];
      return execution === undefined ? [] : [[id, this.compactEvidence(id, execution)]];
    }));
  }

  canonicalFacts(executions: ScenarioExecutionRecord | undefined): CanonicalFact[] {
    if (!executions) return [];
    return this.ids().flatMap((id) => {
      const execution = executions[id];
      if (!execution) return [];
      return this.require<unknown, ScenarioExecutionBase, ScenarioExecutionBase>(id).canonicalFacts(execution);
    });
  }

  assumptionDisclosures(executions: ScenarioExecutionRecord | undefined): string[] {
    if (!executions) return [];
    return this.ids().flatMap((id) => {
      const execution = executions[id];
      if (!execution) return [];
      const disclosure = this.require<unknown, ScenarioExecutionBase, ScenarioExecutionBase>(id)
        .describeAssumptions(execution);
      return disclosure ? [disclosure] : [];
    });
  }
}

export const scenarioCalculatorRegistry = new ScenarioCalculatorRegistry([
  retirementScenarioCalculator,
  homeAffordabilityScenarioCalculator,
]);
