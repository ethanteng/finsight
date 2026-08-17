/**
 * Admin-configurable LLM model selection.
 *
 * Every model the pipeline calls used to be pinned either in source or in a
 * Render environment variable, so changing one meant a deploy. The slots below
 * are stored as a JSON blob on the singleton `ai_prompt_config` row and cached
 * in memory alongside the response-tone config.
 *
 * Resolution order per slot is admin setting → environment variable → shipped
 * default, so an existing deploy keeps its env-configured model until an admin
 * overrides it, and clearing the override falls back to the env value rather
 * than to whatever this file happened to ship with.
 */

import { getPrismaClient } from '../prisma-client';

export type ModelProvider = 'anthropic' | 'openai' | 'google';

export type ModelSlotId = 'analysis' | 'fallback' | 'validation' | 'profile' | 'contextPlanner';

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
      'Audits the preflight data-pack selection through a constrained tool, then writes every Ask Linc answer. Changing this changes the safety check, voice and reasoning quality of the whole product.',
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
    id: 'contextPlanner',
    label: 'Context planning',
    provider: 'openai',
    description:
      'The preflight half of context planning: reads every turn in the active decision, selects the initial data packs, and extracts stated retirement inputs. The primary analysis model performs the second, tool-based audit. Must support JSON schema structured output.',
    shippedDefault: 'gpt-4o',
  },
];

const SLOT_BY_ID = new Map<string, ModelSlotMeta>(MODEL_SLOTS.map(slot => [slot.id, slot]));

/**
 * How each model is asked to generate, alongside which model it is. These were
 * constants at the call sites, which meant the parameters that most change an
 * answer's cost and latency needed a deploy to tune, while the model beside them
 * could be swapped from the panel.
 *
 * Settings hang off the slot rather than sitting in one global list, because
 * which of them exist is a property of the provider and the call: thinking only
 * means something to Claude, and the three OpenAI calls each start from a
 * different temperature.
 */
export type GenerationSettingId = 'thinking' | 'effort' | 'maxOutputTokens' | 'temperature';

/**
 * The value that leaves a parameter out of the request entirely, handing the
 * decision to the provider's own default.
 *
 * This is what makes a setting safe to expose. Providers retire parameters —
 * newer OpenAI reasoning models reject a non-default `temperature`, and the
 * Claude 4.7 generation dropped it altogether — so without a way to send
 * nothing, adding a knob would hand an admin a reliable way to 400 every
 * request in a slot. It is also how the settings that are currently unsent stay
 * unsent until someone asks for them.
 */
export const OMIT_SETTING = 'off';

export interface GenerationSettingMeta {
  id: GenerationSettingId;
  label: string;
  description: string;
  kind: 'enum' | 'integer' | 'decimal';
  /** Allowed values, most economical first. Enum settings only. */
  options?: readonly string[];
  /** Inclusive bounds for a numeric setting. */
  min?: number;
  max?: number;
  /** Whether `off` is accepted, meaning the parameter is left out of the call. */
  omittable: boolean;
  envVar?: string;
  shippedDefault: string;
}

const THINKING_SETTING: GenerationSettingMeta = {
  id: 'thinking',
  label: 'Thinking',
  description:
    'Whether the model reasons before answering. Adaptive lets it decide per question; disabled trades answer quality for latency and cost. Never sent to models older than the 4.6 generation, which cannot accept it.',
  kind: 'enum',
  options: ['adaptive', 'disabled'],
  omittable: false,
  shippedDefault: 'adaptive',
};

const EFFORT_SETTING: GenerationSettingMeta = {
  id: 'effort',
  label: 'Thinking effort',
  description:
    'How much reasoning to spend before answering. Higher settings cost more tokens and take longer. Only sent while thinking is adaptive.',
  kind: 'enum',
  options: ['low', 'medium', 'high', 'xhigh', 'max'],
  omittable: false,
  shippedDefault: 'medium',
};

function maxOutputTokensSetting(options: {
  shippedDefault: string;
  omittable: boolean;
  envVar?: string;
  description: string;
}): GenerationSettingMeta {
  return {
    id: 'maxOutputTokens',
    label: 'Max output tokens',
    kind: 'integer',
    min: 256,
    max: 128_000,
    ...options,
  };
}

function temperatureSetting(shippedDefault: string, description: string): GenerationSettingMeta {
  return {
    id: 'temperature',
    label: 'Temperature',
    description,
    kind: 'decimal',
    min: 0,
    max: 2,
    omittable: true,
    shippedDefault,
  };
}

/** The settings each slot exposes, in the order the panel should show them. */
export const SLOT_GENERATION_SETTINGS: Record<ModelSlotId, GenerationSettingMeta[]> = {
  analysis: [
    THINKING_SETTING,
    EFFORT_SETTING,
    maxOutputTokensSetting({
      shippedDefault: '16000',
      // Anthropic requires the parameter, so there is no provider default to
      // hand back to.
      omittable: false,
      envVar: 'ASK_LINC_MAX_OUTPUT_TOKENS',
      description:
        'Ceiling on a single answer. While thinking is adaptive this budget covers the reasoning and the answer together, so a low value truncates long answers — truncation is reported to Sentry when it happens.',
    }),
  ],
  fallback: [
    temperatureSetting(
      '0.2',
      'How much the wording varies between identical questions. Set to off if the model rejects the parameter — several newer OpenAI models accept only their own default.'
    ),
    maxOutputTokensSetting({
      shippedDefault: '16000',
      omittable: true,
      envVar: 'ASK_LINC_MAX_OUTPUT_TOKENS',
      description:
        'Ceiling on a single answer from the fallback provider. Truncation is reported to Sentry when it happens.',
    }),
  ],
  validation: [
    temperatureSetting(
      OMIT_SETTING,
      'How much the review varies between identical answers. Currently not sent at all, leaving Gemini its own default.'
    ),
    maxOutputTokensSetting({
      shippedDefault: OMIT_SETTING,
      omittable: true,
      description:
        'Ceiling on the review. The review is a short JSON verdict, so this is only worth setting to bound a runaway response.',
    }),
  ],
  profile: [
    temperatureSetting(
      '0.1',
      'How much the rewritten profile varies between identical conversations. Low values keep an unchanged conversation from churning the stored profile.'
    ),
    maxOutputTokensSetting({
      shippedDefault: OMIT_SETTING,
      omittable: true,
      description:
        'Ceiling on the rewritten profile. Currently unset — a profile truncated mid-way would be stored as if it were complete, so raise this rather than lowering it.',
    }),
  ],
  contextPlanner: [
    temperatureSetting(
      '0',
      'How much routing varies between identical decisions. Zero is deliberate: context selection and extracted inputs should be stable.'
    ),
    maxOutputTokensSetting({
      shippedDefault: '1500',
      omittable: true,
      description:
        'Ceiling on the structured context plan. The response is a small fixed JSON object.',
    }),
  ],
};

export function isGenerationSettingId(value: string): value is GenerationSettingId {
  return value === 'thinking' || value === 'effort' || value === 'maxOutputTokens' || value === 'temperature';
}

/** The settings this slot exposes, or an empty list for a slot with none. */
export function generationSettingsForSlot(slotId: ModelSlotId): GenerationSettingMeta[] {
  return SLOT_GENERATION_SETTINGS[slotId] ?? [];
}

function findSetting(
  slotId: ModelSlotId,
  settingId: GenerationSettingId
): GenerationSettingMeta | undefined {
  return generationSettingsForSlot(slotId).find(setting => setting.id === settingId);
}

/**
 * Whether a value is usable for this setting. Shared by the save path, which
 * reports the reason, and the load path, which silently drops anything a stored
 * blob should not be able to push into a provider call.
 */
export function isValidGenerationSettingValue(
  setting: GenerationSettingMeta,
  value: string
): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === OMIT_SETTING) return setting.omittable;
  if (setting.kind === 'enum') return (setting.options ?? []).includes(trimmed);
  const pattern = setting.kind === 'integer' ? /^\d+$/ : /^\d+(\.\d+)?$/;
  if (!pattern.test(trimmed)) return false;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return false;
  if (setting.min !== undefined && parsed < setting.min) return false;
  if (setting.max !== undefined && parsed > setting.max) return false;
  return true;
}

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

/** The value used when an admin has set no override for this setting. */
export function generationSettingDefault(setting: GenerationSettingMeta): string {
  const fromEnv = setting.envVar ? (process.env[setting.envVar] ?? '').trim() : '';
  // An env value that is out of range is a misconfiguration, not an intent to
  // break the pipeline; fall through to the shipped value rather than honour it.
  if (fromEnv.length > 0 && isValidGenerationSettingValue(setting, fromEnv)) return fromEnv;
  return setting.shippedDefault;
}

export type ModelOverrides = Partial<Record<ModelSlotId, string>>;
export type GenerationSettingOverrides = Partial<
  Record<ModelSlotId, Partial<Record<GenerationSettingId, string>>>
>;

const CACHE_TTL_MS = 60_000;

let cachedOverrides: ModelOverrides = {};
let cachedGenerationSettings: GenerationSettingOverrides = {};

/**
 * Freshness is tracked per concern rather than once for the row, because the two
 * are written independently. A save that carries only models — a client from
 * before generation settings existed, or one mid-rolling-deploy — refreshes the
 * model cache and must not thereby mark the settings cache current: on a cold
 * instance that would leave it empty while suppressing the reload that would
 * have filled it, so every request for the next minute would quietly run on
 * defaults instead of the overrides sitting in the database.
 */
let overridesLoadedAt = 0;
let generationSettingsLoadedAt = 0;

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
 * The generation-settings counterpart of `normalizeOverrides`, over a blob that
 * is nested one level deeper: slot -> setting -> value.
 */
function normalizeGenerationSettings(raw: unknown): GenerationSettingOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: GenerationSettingOverrides = {};
  for (const [slotKey, slotValue] of Object.entries(raw as Record<string, unknown>)) {
    if (!isModelSlotId(slotKey)) continue;
    if (!slotValue || typeof slotValue !== 'object' || Array.isArray(slotValue)) continue;
    const perSlot: Partial<Record<GenerationSettingId, string>> = {};
    for (const [settingKey, value] of Object.entries(slotValue as Record<string, unknown>)) {
      if (!isGenerationSettingId(settingKey)) continue;
      if (typeof value !== 'string') continue;
      // A setting this slot does not expose has no call site to reach, so a
      // stored value for it is stale config rather than an instruction.
      const setting = findSetting(slotKey, settingKey);
      if (!setting) continue;
      const trimmed = value.trim();
      if (!isValidGenerationSettingValue(setting, trimmed)) continue;
      perSlot[settingKey] = trimmed;
    }
    if (Object.keys(perSlot).length > 0) result[slotKey] = perSlot;
  }
  return result;
}

/**
 * Synchronously resolve one generation setting. Same resolution order and same
 * cold-process guarantee as `getActiveModel`. Returns `off` when the parameter
 * should be left out of the request entirely.
 */
export function getActiveGenerationSetting(
  slotId: ModelSlotId,
  settingId: GenerationSettingId
): string {
  const setting = findSetting(slotId, settingId);
  if (!setting) throw new Error(`Unknown generation setting: ${slotId}.${settingId}`);
  return cachedGenerationSettings[slotId]?.[settingId] ?? generationSettingDefault(setting);
}

/**
 * Resolve a numeric generation setting, or null when it is omitted. Callers
 * spread the parameter in only when this returns a number, so `off` and an
 * unparseable stored value both mean "do not send it".
 */
export function getActiveNumericGenerationSetting(
  slotId: ModelSlotId,
  settingId: GenerationSettingId
): number | null {
  const value = getActiveGenerationSetting(slotId, settingId);
  if (value === OMIT_SETTING) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Every slot's settings with their resolved values, for the admin panel. */
export function getActiveGenerationSettings(): Array<{
  slotId: ModelSlotId;
  settings: Array<
    GenerationSettingMeta & { value: string; isOverridden: boolean; defaultValue: string }
  >;
}> {
  return MODEL_SLOTS.map(slot => ({
    slotId: slot.id,
    settings: generationSettingsForSlot(slot.id).map(setting => {
      const defaultValue = generationSettingDefault(setting);
      const override = cachedGenerationSettings[slot.id]?.[setting.id];
      return {
        ...setting,
        defaultValue,
        value: override ?? defaultValue,
        isOverridden: override !== undefined,
      };
    }),
  }));
}

/** Update the cache immediately after an admin edit. */
export function setActiveGenerationSettings(raw: unknown): GenerationSettingOverrides {
  cachedGenerationSettings = normalizeGenerationSettings(raw);
  generationSettingsLoadedAt = Date.now();
  return cachedGenerationSettings;
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
  overridesLoadedAt = Date.now();
  return cachedOverrides;
}

/**
 * Load model overrides from the database into the cache. Never throws — on any
 * failure the existing cache (or the env/shipped defaults) is preserved so the
 * pipeline always has a model to call.
 */
export async function loadModelConfig(force = false): Promise<ModelOverrides> {
  // Whichever half is staler decides: one row and one query fill both, so
  // reloading a still-fresh half costs nothing and leaving a stale one costs a
  // minute of wrong config.
  const loadedAt = Math.min(overridesLoadedAt, generationSettingsLoadedAt);
  if (!force && Date.now() - loadedAt < CACHE_TTL_MS) {
    return cachedOverrides;
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.aiPromptConfig.findUnique({
      where: { id: AI_PROMPT_CONFIG_ID_FOR_MODELS },
      select: { models: true, generationSettings: true },
    });
    cachedOverrides = normalizeOverrides(row?.models);
    cachedGenerationSettings = normalizeGenerationSettings(row?.generationSettings);
  } catch (error) {
    console.warn('Failed to load model config; using cached/default values:', error);
  }

  overridesLoadedAt = Date.now();
  generationSettingsLoadedAt = overridesLoadedAt;
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
  cachedGenerationSettings = {};
  overridesLoadedAt = 0;
  generationSettingsLoadedAt = 0;
}
