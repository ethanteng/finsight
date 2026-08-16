'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface CategoryMeta {
  id: string;
  label: string;
  /** The routing decision this category feeds, matching a badge label below. */
  feeds: string;
  /** False when the category only has an effect combined with something else. */
  standalone: boolean;
  description: string;
}

interface VocabularyResponse {
  categories: CategoryMeta[];
  terms: Record<string, string[]>;
  defaultTerms: Record<string, string[]>;
  isDefault: boolean;
  lastEditedBy: string | null;
  updatedAt: string | null;
}

interface PreviewResponse {
  needs: Record<string, boolean>;
  matches: Record<string, string[]>;
}

/** The needs an admin can act on, in the order they affect an answer. */
const NEED_LABELS: Array<[string, string]> = [
  ['needsRetirement', 'Retirement'],
  ['needsInvestments', 'Investments'],
  ['needsAccountDetails', 'Accounts'],
  ['needsTransactionDetails', 'Transactions'],
  ['needsHomeValue', 'Home value'],
  ['needsMonthlyCashFlow', 'Monthly cash flow'],
  ['needsMarketContext', 'Market context'],
  ['needsSearchContext', 'Rates & rules'],
  ['needsUserProfile', 'Profile'],
  ['needsSecondaryValidation', 'Second review'],
];

export default function RoutingVocabularyPanel({
  apiUrl,
  getAuthHeaders,
}: {
  apiUrl: string | undefined;
  getAuthHeaders: () => Record<string, string>;
}) {
  const [data, setData] = useState<VocabularyResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'error' | 'ok'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [question, setQuestion] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const authHeadersRef = useRef(getAuthHeaders);
  authHeadersRef.current = getAuthHeaders;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/admin/ai/routing-vocabulary`, {
        headers: authHeadersRef.current(),
      });
      if (!response.ok) {
        setStatus({ kind: 'error', message: 'Failed to load routing vocabulary' });
        return;
      }
      const body: VocabularyResponse = await response.json();
      setData(body);
      setDraft(Object.fromEntries(body.categories.map((c) => [c.id, (body.terms[c.id] || []).join(', ')])));
    } catch {
      setStatus({ kind: 'error', message: 'Failed to load routing vocabulary' });
    }
  }, [apiUrl]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const terms = Object.fromEntries(
        Object.entries(draft).map(([id, value]) => [
          id,
          value.split(',').map((term) => term.trim()).filter(Boolean),
        ])
      );
      const response = await fetch(`${apiUrl}/admin/ai/routing-vocabulary`, {
        method: 'PUT',
        headers: authHeadersRef.current(),
        body: JSON.stringify({ terms }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus({ kind: 'error', message: body.error || 'Failed to save' });
        return;
      }
      setStatus({ kind: 'ok', message: 'Saved. New questions use these terms within a minute.' });
      await load();
      if (question.trim()) await runPreview();
    } catch {
      setStatus({ kind: 'error', message: 'Failed to save routing vocabulary' });
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    if (!question.trim()) return;
    try {
      const response = await fetch(`${apiUrl}/admin/ai/routing-preview`, {
        method: 'POST',
        headers: authHeadersRef.current(),
        body: JSON.stringify({ question }),
      });
      if (!response.ok) {
        setStatus({ kind: 'error', message: 'Failed to preview routing' });
        return;
      }
      setPreview(await response.json());
    } catch {
      setStatus({ kind: 'error', message: 'Failed to preview routing' });
    }
  };

  const resetCategory = (id: string) => {
    if (!data) return;
    setDraft((current) => ({ ...current, [id]: (data.defaultTerms[id] || []).join(', ') }));
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-white">Question routing vocabulary</h2>
        {data && (
          <span className="text-xs text-gray-400">
            {data.isDefault ? 'Using shipped defaults' : `Edited by ${data.lastEditedBy || 'admin'}`}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-400 mb-4">
        The words that decide which data a question loads. Plain words and phrases, comma separated —
        not regular expressions. End a term with <code className="text-gray-200">*</code> to match the
        whole word family: <code className="text-gray-200">retir*</code> covers retire, retiring,
        retired, and retirement. A missing word here means a question silently gets less data than it
        needed, so use the tester below before saving.
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

      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 mb-6">
        <label className="block text-sm text-gray-300 mb-2" htmlFor="routing-preview-question">
          Test a question
        </label>
        <div className="flex gap-2">
          <input
            id="routing-preview-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') runPreview(); }}
            placeholder="e.g. my goal of retiring by age 62 or sooner"
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
          />
          <button onClick={runPreview} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm">
            Check
          </button>
        </div>

        {preview && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {NEED_LABELS.map(([need, label]) => (
                <span
                  key={need}
                  className={`text-xs px-2 py-1 rounded ${
                    preview.needs[need]
                      ? 'bg-green-900/60 text-green-300'
                      : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              {Object.entries(preview.matches).filter(([, terms]) => terms.length > 0).length === 0 ? (
                <div>
                  No configured terms matched. Anything lit above came from a built-in structural pattern
                  rather than from this vocabulary.
                </div>
              ) : (
                Object.entries(preview.matches)
                  .filter(([, terms]) => terms.length > 0)
                  .map(([category, terms]) => {
                    const meta = (data?.categories || []).find((entry) => entry.id === category);
                    return (
                      <div key={category}>
                        <span className="text-gray-200">{meta?.label ?? category}</span>
                        <span className="text-gray-500"> → {meta?.feeds ?? category}</span>
                        {meta && !meta.standalone && (
                          <span className="text-gray-500"> (only alongside a spending word)</span>
                        )}
                        <span className="text-gray-500">: </span>
                        <code className="text-gray-300">{terms.join(', ')}</code>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {(data?.categories || []).map((category) => (
          <div key={category.id}>
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium text-white" htmlFor={`terms-${category.id}`}>
                {category.label}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  → {category.feeds}
                  {!category.standalone && ' (only in combination)'}
                </span>
              </label>
              <button
                onClick={() => resetCategory(category.id)}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                Reset to default
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-1">{category.description}</p>
            <textarea
              id={`terms-${category.id}`}
              value={draft[category.id] ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, [category.id]: event.target.value }))}
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !data}
          className={`px-4 py-2 rounded text-sm ${
            saving || !data ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {saving ? 'Saving…' : 'Save vocabulary'}
        </button>
        {data?.updatedAt && (
          <span className="text-xs text-gray-500">
            Last updated {new Date(data.updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
