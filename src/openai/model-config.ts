/**
 * Admin-configurable LLM model selection.
 *
 * Every model the pipeline calls used to be pinned either in source or in a
 * Render environment variable, so changing one meant a deploy. The slots below
 * are stored as a JSON blob on the singleton `ai_prompt_config` row and cached
 * in memory, mirroring the response-tone and routing-vocabulary configs.
 *
 * Resolution order per slot is admin setting → environment variable → shipped
 * default, so an existing deploy keeps its env-configured model until an admin
 * overrides it, and clearing the override falls back to the env value rather
 * than to whatever this file happened to ship with.
 */

import { getPrismaClient } from '../prisma-client';

export type ModelProvider = 'anthropic' | 'openai' | 'google';

export type ModelSlotId = 'analysis' | 'fallback' | 'validation' | 'profile' | 'retirementInputs';

export interface ModelSlotMeta {
  id: ModelSlotId;
  label: string;
  provider: ModelProvider;
  /** What this model does, in terms an admin can act on. */
  description: string;
  /** Environment variable consulted when no admin override is set. */
  envVar?: string;
  /** Shipped value when neither an override nor the environment supplies one. */
  shippedDefault: string;
}

export interface ProviderMeta {
  id: ModelProvider;
  label: string;
  /** Where the provider publishes its current model IDs. */
  docsUrl: string;
  /** Environment variable holding this provider's API key. */
  apiKeyEnvVars: string[];
}

export const MODEL_PROVIDERS: Record<ModelProvider, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    apiKeyEnvVars: ['ANTHROPIC_API_KEY'],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    docsUrl: 'https://platform.openai.com/docs/models',
    apiKeyEnvVars: ['OPENAI_API_KEY'],
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    apiKeyEnvVars: ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'],
  },
};

export const MODEL_SLOTS: ModelSlotMeta[] = [
  {
    id: 'analysis',
    label: 'Primary analysis',
    provider: 'anthropic',
    description:
      'Writes every Ask Linc answer. Changing this changes the voice and reasoning quality of the whole product.',
    // Matches the model the admin override has been pointing at; a cold process
    // that fails to read the config now falls back to the same model the
    // request code is tuned for rather than to the previous generation.
    shippedDefault: 'claude-sonnet-5',
  },
  {
    id: 'fallback',
    label: 'Fallback analysis',
    provider: 'openai',
    description:
      'Takes over when the primary provider errors or is unavailable. Must support JSON schema structured output.',
    envVar: 'OPENAI_FALLBACK_MODEL',
    shippedDefault: 'gpt-4o',
  },
  {
    id: 'validation',
    label: 'Second review',
    provider: 'google',
    description:
      'Independently checks an answer against the financial snapshot before it reaches the user. Only runs when response validation is enabled.',
    envVar: 'GEMINI_VALIDATION_MODEL',
    shippedDefault: 'gemini-3-flash-preview',
  },
  {
    id: 'profile',
    label: 'Profile extraction',
    provider: 'openai',
    description:
      'Reads each answered question and updates the stored financial profile with anything new it reveals.',
    shippedDefault: 'gpt-4o',
  },
  {
    id: 'retirementInputs',
    label: 'Retirement inputs',
    provider: 'openai',
    description:
      'Reads a decision\'s turns for the age and spending figures a retirement projection needs. Proposes inputs only — the projection itself stays deterministic. Must support JSON schema structured output.',
    shippedDefault: 'gpt-4o',
  },
];

const SLOT_BY_ID = new Map<string, ModelSlotMeta>(MODEL_SLOTS.map(slot => [slot.id, slot]));

export function isModelSlotId(value: string): value is ModelSlotId {
  return SLOT_BY_ID.has(value);
}

/**
 * A model ID an admin could plausibly mean. Deliberately permissive on
 * characters — providers add naming schemes faster than a strict pattern can
 * track — but strict about the shape, so a pasted sentence or URL is rejected
 * before it reaches a provider.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{1,127}$/;

export function isPlausibleModelId(value: string): boolean {
  return MODEL_ID_PATTERN.test(value.trim());
}

/** The value used when an admin has set no override for this slot. */
export function slotDefault(slot: ModelSlotMeta): string {
  const fromEnv = slot.envVar ? (process.env[slot.envVar] ?? '').trim() : '';
  return fromEnv.length > 0 ? fromEnv : slot.shippedDefault;
}

export type ModelOverrides = Partial<Record<ModelSlotId, string>>;

const CACHE_TTL_MS = 60_000;

let cachedOverrides: ModelOverrides = {};
let cacheLoadedAt = 0;

/**
 * Keep only recognised slots with plausible values. A stored blob that predates
 * a slot rename, or that someone edited in the database, must not be able to
 * push an unusable model ID into a provider call.
 */
function normalizeOverrides(raw: unknown): ModelOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: ModelOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isModelSlotId(key)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length === 0 || !isPlausibleModelId(trimmed)) continue;
    result[key] = trimmed;
  }
  return result;
}

/**
 * Synchronously resolve the model for a slot from the cached config. Falls back
 * to the environment/shipped default until `loadModelConfig()` has run, so a
 * cold process still calls a working model.
 */
export function getActiveModel(slotId: ModelSlotId): string {
  const slot = SLOT_BY_ID.get(slotId);
  if (!slot) throw new Error(`Unknown model slot: ${slotId}`);
  return cachedOverrides[slotId] ?? slotDefault(slot);
}

/** Every slot's resolved model plus whether an admin override is in play. */
export function getActiveModelConfig(): Array<
  ModelSlotMeta & { model: string; isOverridden: boolean; defaultModel: string }
> {
  return MODEL_SLOTS.map(slot => {
    const defaultModel = slotDefault(slot);
    const override = cachedOverrides[slot.id];
    return {
      ...slot,
      defaultModel,
      model: override ?? defaultModel,
      isOverridden: override !== undefined,
    };
  });
}

/** Update the cache immediately after an admin edit. */
export function setActiveModelOverrides(raw: unknown): ModelOverrides {
  cachedOverrides = normalizeOverrides(raw);
  cacheLoadedAt = Date.now();
  return cachedOverrides;
}

/**
 * Load model overrides from the database into the cache. Never throws — on any
 * failure the existing cache (or the env/shipped defaults) is preserved so the
 * pipeline always has a model to call.
 */
export async function loadModelConfig(force = false): Promise<ModelOverrides> {
  if (!force && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedOverrides;
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.aiPromptConfig.findUnique({
      where: { id: AI_PROMPT_CONFIG_ID_FOR_MODELS },
      select: { models: true },
    });
    cachedOverrides = normalizeOverrides(row?.models);
  } catch (error) {
    console.warn('Failed to load model config; using cached/default values:', error);
  }

  cacheLoadedAt = Date.now();
  return cachedOverrides;
}

/**
 * Duplicated rather than imported from prompt-config to keep this module free of
 * a cycle: prompt-config imports nothing from here, and the admin routes import
 * both.
 */
const AI_PROMPT_CONFIG_ID_FOR_MODELS = 'global';

/** Reset the in-memory cache. Intended for tests. */
export function resetModelConfigCache(): void {
  cachedOverrides = {};
  cacheLoadedAt = 0;
}
