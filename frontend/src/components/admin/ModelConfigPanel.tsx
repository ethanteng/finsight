'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface CatalogEntry {
  id: string;
  label?: string;
  recommended: boolean;
}

interface ProviderInfo {
  id: string;
  label: string;
  docsUrl: string;
  apiKeyEnvVars: string[];
  models: CatalogEntry[] | null;
  unavailableReason?: string;
  fetchedAt: string;
}

interface SlotInfo {
  id: string;
  label: string;
  provider: string;
  description: string;
  envVar?: string;
  shippedDefault: string;
  defaultModel: string;
  model: string;
  isOverridden: boolean;
  verification: { status: 'served' | 'not_served' | 'unverified'; reason?: string };
}

interface ModelConfigResponse {
  slots: SlotInfo[];
  providers: ProviderInfo[];
}

/** Sentinel for "no override" — distinct from any real model id. */
const USE_DEFAULT = '';

/**
 * Options for one slot: everything the provider serves, plus the slot's current
 * value when the catalog doesn't list it. A model configured before a key
 * rotation, or one the list endpoint hasn't caught up on, must stay selectable
 * rather than silently switching the admin to something else on save.
 */
export function buildOptions(
  catalog: CatalogEntry[] | null,
  current: string
): { recommended: CatalogEntry[]; other: CatalogEntry[] } {
  const entries = [...(catalog ?? [])];
  if (current && !entries.some((entry) => entry.id === current)) {
    entries.push({ id: current, label: 'currently configured', recommended: true });
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));
  return {
    recommended: entries.filter((entry) => entry.recommended),
    other: entries.filter((entry) => !entry.recommended),
  };
}

function optionLabel(entry: CatalogEntry): string {
  return entry.label && entry.label !== entry.id ? `${entry.id} — ${entry.label}` : entry.id;
}

export default function ModelConfigPanel({
  apiUrl,
  getAuthHeaders,
}: {
  apiUrl: string | undefined;
  getAuthHeaders: () => Record<string, string>;
}) {
  const [data, setData] = useState<ModelConfigResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'error' | 'ok'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const authHeadersRef = useRef(getAuthHeaders);
  authHeadersRef.current = getAuthHeaders;

  const load = useCallback(async (refresh = false) => {
    try {
      const response = await fetch(`${apiUrl}/admin/ai/models${refresh ? '?refresh=true' : ''}`, {
        headers: authHeadersRef.current(),
      });
      if (!response.ok) {
        setStatus({ kind: 'error', message: 'Failed to load model configuration' });
        return;
      }
      const body: ModelConfigResponse = await response.json();
      setData(body);
      setDraft(
        Object.fromEntries(body.slots.map((slot) => [slot.id, slot.isOverridden ? slot.model : USE_DEFAULT]))
      );
    } catch {
      setStatus({ kind: 'error', message: 'Failed to load model configuration' });
    }
  }, [apiUrl]);

  useEffect(() => { load(); }, [load]);

  const refreshCatalogs = async () => {
    setRefreshing(true);
    setStatus(null);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  };

  const save = async (allowUnlisted = false) => {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`${apiUrl}/admin/ai/models`, {
        method: 'PUT',
        headers: authHeadersRef.current(),
        body: JSON.stringify({ models: draft, allowUnlisted }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ kind: 'error', message: body.error || 'Failed to save' });
        return;
      }
      setStatus({ kind: 'ok', message: 'Saved. New questions use these models within a minute.' });
      await load();
    } catch {
      setStatus({ kind: 'error', message: 'Failed to save model configuration' });
    } finally {
      setSaving(false);
    }
  };

  const providerFor = (id: string) => data?.providers.find((provider) => provider.id === id);

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-white">Models in use</h2>
        <button
          onClick={refreshCatalogs}
          disabled={refreshing}
          className="text-xs text-gray-400 hover:text-gray-200"
        >
          {refreshing ? 'Refreshing…' : 'Refresh model lists'}
        </button>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Which model runs at each step of the pipeline. Each list comes from the provider itself, so
        it only offers models your API key can actually call — there is nothing to type and no id to
        get wrong. Choosing <span className="text-gray-200">Use default</span> hands the slot back to
        its environment variable, or to the value the app ships with.
      </p>

      {status && (
        <div className={`rounded-lg p-3 mb-4 border ${
          status.kind === 'error'
            ? 'bg-red-900/50 border-red-700 text-red-200'
            : 'bg-green-900/50 border-green-700 text-green-200'
        }`}>
          {status.message}
        </div>
      )}

      <div className="space-y-4">
        {(data?.slots || []).map((slot) => {
          const provider = providerFor(slot.provider);
          const options = buildOptions(provider?.models ?? null, slot.model);
          const catalogUnavailable = !provider?.models;

          return (
            <div key={slot.id} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
              <div className="flex items-baseline justify-between gap-4">
                <label className="text-sm font-medium text-white" htmlFor={`model-${slot.id}`}>
                  {slot.label}
                  <span className="ml-2 text-xs font-normal text-gray-400">{provider?.label ?? slot.provider}</span>
                </label>
                {provider && (
                  <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-gray-400 hover:text-gray-200 underline shrink-0"
                  >
                    Model docs
                  </a>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2">{slot.description}</p>

              {catalogUnavailable ? (
                <>
                  <input
                    id={`model-${slot.id}`}
                    value={draft[slot.id] ?? ''}
                    onChange={(event) => setDraft((current) => ({ ...current, [slot.id]: event.target.value }))}
                    placeholder={slot.defaultModel}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono"
                  />
                  <p className="text-xs text-yellow-400 mt-1">
                    {provider?.unavailableReason} — the list of valid models is unavailable, so this
                    falls back to typing an id. It will not be checked before saving.
                  </p>
                </>
              ) : (
                <select
                  id={`model-${slot.id}`}
                  value={draft[slot.id] ?? USE_DEFAULT}
                  onChange={(event) => setDraft((current) => ({ ...current, [slot.id]: event.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono"
                >
                  <option value={USE_DEFAULT}>Use default ({slot.defaultModel})</option>
                  {options.recommended.length > 0 && (
                    <optgroup label="Chat models">
                      {options.recommended.map((entry) => (
                        <option key={entry.id} value={entry.id}>{optionLabel(entry)}</option>
                      ))}
                    </optgroup>
                  )}
                  {options.other.length > 0 && (
                    <optgroup label="Other models from this provider">
                      {options.other.map((entry) => (
                        <option key={entry.id} value={entry.id}>{optionLabel(entry)}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}

              <p className="text-xs text-gray-500 mt-1">
                Running <code className="text-gray-300">{slot.model}</code>
                {slot.isOverridden ? ' (set here)' : slot.envVar ? ` (from ${slot.envVar} or shipped default)` : ' (shipped default)'}
                {slot.verification.status === 'not_served' && (
                  <span className="text-red-400"> — this provider does not serve that model</span>
                )}
                {slot.verification.status === 'unverified' && (
                  <span className="text-yellow-400"> — could not be verified</span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving || !data}
          className={`px-4 py-2 rounded text-sm ${
            saving || !data ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {saving ? 'Saving…' : 'Save models'}
        </button>
        {status?.kind === 'error' && /use anyway/.test(status.message) && (
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="px-4 py-2 rounded text-sm bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            Use anyway
          </button>
        )}
      </div>
    </div>
  );
}
