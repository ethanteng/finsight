/**
 * Live model catalog.
 *
 * A curated list of model IDs goes stale the moment a provider ships a new one,
 * so the admin UI validates against what each provider actually serves right
 * now rather than against anything hardcoded here. Every provider exposes a
 * list-models endpoint; we call it over REST rather than through each SDK so
 * this keeps working across SDK versions (the pinned Anthropic SDK, for one,
 * predates its own Models API).
 *
 * A lookup that fails is reported as unavailable, never as "model not found" —
 * an unreachable provider must not read as a typo in the admin's input.
 */

import { MODEL_PROVIDERS, ModelProvider } from './model-config';

export interface CatalogEntry {
  id: string;
  label?: string;
  /**
   * Whether this looks like a model that can answer a prompt. A display hint
   * only — the admin picker groups these first but still offers everything the
   * provider returned, so a new naming scheme can never hide a valid model.
   */
  recommended: boolean;
}

/** Model families that answer prompts, per provider. */
const CHAT_MODEL_PATTERNS: Record<ModelProvider, RegExp> = {
  anthropic: /^claude-/i,
  openai: /^(gpt|o\d|chatgpt)/i,
  google: /^gemini-/i,
};

/** Single-purpose models that share a chat family's prefix but cannot chat. */
const NON_CHAT_PATTERN =
  /(embedding|embed|whisper|tts|audio|transcribe|realtime|dall-e|image|imagen|veo|moderation|rerank|aqa)/i;

function looksLikeChatModel(provider: ModelProvider, id: string): boolean {
  return CHAT_MODEL_PATTERNS[provider].test(id) && !NON_CHAT_PATTERN.test(id);
}

export interface ProviderCatalog {
  provider: ModelProvider;
  /** Model IDs the provider currently serves, or null when the lookup failed. */
  models: CatalogEntry[] | null;
  /** Why the catalog is unavailable, for display. Absent on success. */
  unavailableReason?: string;
  fetchedAt: string;
}

const CATALOG_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
/** Bound pagination so a provider that keeps returning cursors can't hang the request. */
const MAX_PAGES = 10;

const cache = new Map<ModelProvider, { catalog: ProviderCatalog; expiresAt: number }>();

function apiKeyFor(provider: ModelProvider): string {
  for (const envVar of MODEL_PROVIDERS[provider].apiKeyEnvVars) {
    const value = (process.env[envVar] ?? '').trim();
    if (value) return value;
  }
  return '';
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAnthropicModels(apiKey: string): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  let afterId: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('https://api.anthropic.com/v1/models');
    url.searchParams.set('limit', '100');
    if (afterId) url.searchParams.set('after_id', afterId);

    const body = (await getJson(url.toString(), {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    })) as { data?: Array<{ id?: string; display_name?: string }>; has_more?: boolean; last_id?: string };

    for (const item of body.data ?? []) {
      if (typeof item.id === 'string') {
        entries.push({
          id: item.id,
          label: item.display_name,
          recommended: looksLikeChatModel('anthropic', item.id),
        });
      }
    }
    if (!body.has_more || !body.last_id) break;
    afterId = body.last_id;
  }

  return entries;
}

async function fetchOpenAIModels(apiKey: string): Promise<CatalogEntry[]> {
  const body = (await getJson('https://api.openai.com/v1/models', {
    Authorization: `Bearer ${apiKey}`,
  })) as { data?: Array<{ id?: string }> };

  return (body.data ?? [])
    .filter((item): item is { id: string } => typeof item.id === 'string')
    .map(item => ({ id: item.id, recommended: looksLikeChatModel('openai', item.id) }));
}

async function fetchGoogleModels(apiKey: string): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const body = (await getJson(url.toString(), {})) as {
      models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
      nextPageToken?: string;
    };

    for (const item of body.models ?? []) {
      if (typeof item.name !== 'string') continue;
      // Only models that can answer a prompt are usable in any of our slots.
      const methods = item.supportedGenerationMethods;
      if (methods && !methods.includes('generateContent')) continue;
      const id = item.name.replace(/^models\//, '');
      entries.push({ id, label: item.displayName, recommended: looksLikeChatModel('google', id) });
    }

    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }

  return entries;
}

async function fetchProviderModels(provider: ModelProvider, apiKey: string): Promise<CatalogEntry[]> {
  switch (provider) {
    case 'anthropic':
      return fetchAnthropicModels(apiKey);
    case 'openai':
      return fetchOpenAIModels(apiKey);
    case 'google':
      return fetchGoogleModels(apiKey);
  }
}

/**
 * List the models a provider currently serves. Cached briefly so opening the
 * admin panel repeatedly doesn't hammer three provider APIs.
 */
export async function getProviderCatalog(
  provider: ModelProvider,
  force = false
): Promise<ProviderCatalog> {
  const cached = cache.get(provider);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.catalog;
  }

  const fetchedAt = new Date().toISOString();
  const apiKey = apiKeyFor(provider);

  let catalog: ProviderCatalog;
  if (!apiKey) {
    catalog = {
      provider,
      models: null,
      unavailableReason: `No API key configured (${MODEL_PROVIDERS[provider].apiKeyEnvVars.join(' or ')})`,
      fetchedAt,
    };
  } else {
    try {
      catalog = { provider, models: await fetchProviderModels(provider, apiKey), fetchedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.warn(`Failed to list ${provider} models:`, message);
      catalog = {
        provider,
        models: null,
        unavailableReason: `Could not reach ${MODEL_PROVIDERS[provider].label}: ${message}`,
        fetchedAt,
      };
    }
  }

  // Only cache a successful lookup, so a transient outage doesn't suppress
  // verification for the next five minutes.
  if (catalog.models) {
    cache.set(provider, { catalog, expiresAt: Date.now() + CATALOG_TTL_MS });
  } else {
    cache.delete(provider);
  }
  return catalog;
}

export async function getAllProviderCatalogs(force = false): Promise<ProviderCatalog[]> {
  const providers = Object.keys(MODEL_PROVIDERS) as ModelProvider[];
  return Promise.all(providers.map(provider => getProviderCatalog(provider, force)));
}

export type VerificationStatus = 'served' | 'not_served' | 'unverified';

export interface ModelVerification {
  status: VerificationStatus;
  /** Present when the catalog could not be consulted. */
  reason?: string;
}

/**
 * Check one model ID against a provider's live catalog. `unverified` means the
 * catalog was unavailable — the caller must not treat it as a bad model ID.
 */
export function verifyAgainstCatalog(catalog: ProviderCatalog, modelId: string): ModelVerification {
  if (!catalog.models) {
    return { status: 'unverified', reason: catalog.unavailableReason };
  }
  const wanted = modelId.trim();
  const served = catalog.models.some(entry => entry.id === wanted);
  return { status: served ? 'served' : 'not_served' };
}

/** Reset the catalog cache. Intended for tests. */
export function resetCatalogCache(): void {
  cache.clear();
}
