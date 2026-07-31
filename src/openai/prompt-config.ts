/**
 * Admin-configurable AI prompt settings.
 *
 * Currently exposes the "response tone" guidance that is injected into every
 * user-facing system prompt (both the legacy OpenAI pipeline in
 * `prompt-builder.ts` and the Claude reasoning pipeline in
 * `financial-reasoning-prompt.ts`).
 *
 * The value is stored as a single row in the `ai_prompt_config` table and
 * cached in memory so the synchronous prompt builders can read it without an
 * awaited DB call. Request entry points call `loadResponseToneConfig()` before
 * building a prompt to keep the cache fresh, and the admin update endpoint calls
 * `setActiveResponseTone()` so edits take effect immediately.
 */

import { getPrismaClient } from '../prisma-client';

/** Singleton row id for the global AI prompt config. */
export const AI_PROMPT_CONFIG_ID = 'global';

/**
 * Default tone guidance used when an admin has not customised it. This is a
 * bullet list (no header) so each pipeline can wrap it with its own heading.
 */
export const DEFAULT_RESPONSE_TONE = [
  '- Be warm, approachable, and conversational while staying professional and accurate.',
  '- Write the way a smart, friendly person would talk: use everyday language, contractions (you\'re, let\'s, here\'s), and a "we\'re in this together" feel.',
  '- Address the user directly as "you" and refer to yourself as "I." It\'s fine to open with a brief, genuine acknowledgement (e.g., "Great question —").',
  '- Keep it encouraging and judgment-free, even when the numbers are tough. Explain the "why" in plain terms and skip unnecessary jargon (briefly define any term you must use).',
  '- Stay concise and genuine — friendly does not mean chatty, gushing, or full of exclamation points. No emojis unless the user uses them first.',
].join('\n');

const CACHE_TTL_MS = 60_000;

let cachedTone: string = DEFAULT_RESPONSE_TONE;
let cacheLoadedAt = 0;

function normalizeTone(tone: string | null | undefined): string {
  const trimmed = (tone ?? '').trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_RESPONSE_TONE;
}

/**
 * Synchronously return the currently cached tone guidance. Falls back to the
 * default until `loadResponseToneConfig()` has populated the cache. Used by the
 * (synchronous) prompt builders.
 */
export function getActiveResponseTone(): string {
  return cachedTone;
}

/**
 * Update the in-memory cache immediately (e.g. right after an admin edit) so the
 * next prompt build reflects the change without waiting for the TTL.
 */
export function setActiveResponseTone(tone: string | null | undefined): void {
  cachedTone = normalizeTone(tone);
  cacheLoadedAt = Date.now();
}

/**
 * Load the tone guidance from the database into the cache. Respects a short TTL
 * unless `force` is true. Never throws — on any failure the existing cache (or
 * default) is preserved so prompt building always succeeds.
 */
export async function loadResponseToneConfig(force = false): Promise<string> {
  if (!force && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedTone;
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.aiPromptConfig.findUnique({
      where: { id: AI_PROMPT_CONFIG_ID },
    });
    cachedTone = normalizeTone(row?.responseTone);
  } catch (error) {
    console.warn('Failed to load response tone config; using cached/default value:', error);
  }

  cacheLoadedAt = Date.now();
  return cachedTone;
}

/** Reset the in-memory cache. Intended for tests. */
export function resetResponseToneCache(): void {
  cachedTone = DEFAULT_RESPONSE_TONE;
  cacheLoadedAt = 0;
}
