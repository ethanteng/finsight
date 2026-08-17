import type { FinancialContextSnapshot } from '../openai/types';
import type { ContextPackId } from '../openai/context-packs';
import { retirementScenarioCalculator } from './retirement-scenario';

export type ScenarioOverrideValueType = 'currency' | 'percentage' | 'age' | 'enum';
export type ScenarioOutputUnit = 'usd' | 'percent' | 'years' | 'count';

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
  value: string | number;
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

export interface ScenarioCalculatorDefinition<Plan, Execution, Evidence>
  extends ScenarioCalculatorManifest {
  planner: {
    jsonSchema: Readonly<Record<string, unknown>>;
    instructions: string;
    parsePlan(value: unknown): Plan | undefined;
  };
  execute(snapshot: FinancialContextSnapshot, plan: Plan): Promise<Execution>;
  unavailable(startedAt: number, reason: string): Execution;
  compactEvidence(execution: Execution): Evidence;
}

type AnyScenarioCalculator = ScenarioCalculatorDefinition<any, any, any>;

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

  require<Plan, Execution, Evidence>(
    id: string
  ): ScenarioCalculatorDefinition<Plan, Execution, Evidence> {
    const definition = this.calculators.get(id);
    if (!definition) throw new Error(`Unknown scenario calculator: ${id}`);
    return definition;
  }

  parsePlan<Plan>(id: string, value: unknown): Plan | undefined {
    return this.require<Plan, unknown, unknown>(id).planner.parsePlan(value);
  }

  requiredPacks(id: string): ContextPackId[] {
    return [...this.require(id).requiredPacks];
  }

  async execute<Plan, Execution>(
    id: string,
    snapshot: FinancialContextSnapshot,
    plan: Plan
  ): Promise<Execution> {
    return this.require<Plan, Execution, unknown>(id).execute(snapshot, plan);
  }

  compactEvidence<Execution, Evidence>(id: string, execution: Execution): Evidence {
    return this.require<unknown, Execution, Evidence>(id).compactEvidence(execution);
  }
}

export const scenarioCalculatorRegistry = new ScenarioCalculatorRegistry([
  retirementScenarioCalculator,
]);
