'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface CategoryOption {
  primary: string;
  label: string;
  detailed: { value: string; label: string }[];
}

export interface TransactionCategorySubject {
  /** Provider transaction id the backend keys the override by. */
  id: string;
  name: string;
  date: string;
  amount: number;
  category: string[];
  isUserCategory: boolean;
}

interface TransactionCategoryModalProps {
  transaction: TransactionCategorySubject;
  onClose: () => void;
  onSaved: (transactionId: string, category: string[], isUserCategory: boolean) => void;
}

// The menu is the same for every transaction and never changes within a session, so the
// first modal pays for the fetch and the rest open with the selects already populated.
let cachedOptions: CategoryOption[] | null = null;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = typeof window === 'undefined' ? null : localStorage.getItem('auth_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function TransactionCategoryModal({
  transaction,
  onClose,
  onSaved,
}: TransactionCategoryModalProps) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const [options, setOptions] = useState<CategoryOption[] | null>(cachedOptions);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [primary, setPrimary] = useState(transaction.category[0]?.toUpperCase() || '');
  const [detailed, setDetailed] = useState(transaction.category[1]?.toUpperCase() || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (options) return;
    let cancelled = false;
    const loadOptions = async () => {
      try {
        const response = await fetch(`${API_URL}/api/transaction-categories/options`, {
          headers: authHeaders(),
        });
        if (!response.ok) throw new Error('Category list is unavailable');
        const body = await response.json();
        const list = Array.isArray(body?.data) ? body.data as CategoryOption[] : [];
        cachedOptions = list;
        if (!cancelled) setOptions(list);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load categories');
        }
      }
    };
    void loadOptions();
    return () => { cancelled = true; };
  }, [API_URL, options]);

  // Snapshot categories are not guaranteed to be taxonomy values — older rows can carry
  // free-text labels like "Food and Drink". Uppercasing one of those yields a value no
  // option has, which renders an empty select while still arming Save for a 400. Drop
  // anything the loaded menu does not recognise so the user makes a deliberate choice.
  useEffect(() => {
    if (!options) return;
    setPrimary(current => {
      if (!current) return current;
      const match = options.find(option => option.primary === current);
      if (!match) {
        setDetailed('');
        return '';
      }
      setDetailed(value => (match.detailed.some(entry => entry.value === value) ? value : ''));
      return current;
    });
  }, [options]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      // Keep Tab inside the dialog so focus never lands on the list behind it.
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), a[href]')
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    primaryRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const detailedOptions = useMemo(
    () => options?.find(option => option.primary === primary)?.detailed ?? [],
    [options, primary]
  );

  // A primary category chosen by hand invalidates whichever subcategory was selected
  // under the previous one, so drop it unless it belongs to the new primary.
  const handlePrimaryChange = (value: string) => {
    setPrimary(value);
    const next = options?.find(option => option.primary === value)?.detailed ?? [];
    setDetailed(current => (next.some(entry => entry.value === current) ? current : ''));
  };

  const save = async () => {
    if (!primary) {
      setSaveError('Pick a category first');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(
        `${API_URL}/api/transaction-categories/${encodeURIComponent(transaction.id)}`,
        {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ primary, detailed: detailed || null }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Failed to save category');
      const saved: string[] = Array.isArray(body?.data?.category)
        ? body.data.category
        : detailed ? [primary, detailed] : [primary];
      onSaved(transaction.id, saved, true);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(
        `${API_URL}/api/transaction-categories/${encodeURIComponent(transaction.id)}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Failed to restore category');
      const restored: string[] = Array.isArray(body?.data?.category) ? body.data.category : [];
      onSaved(transaction.id, restored, false);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to restore category');
    } finally {
      setSaving(false);
    }
  };

  const formattedDate = (() => {
    const date = new Date(transaction.date);
    return Number.isNaN(date.getTime())
      ? transaction.date
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-category-modal-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-gray-800"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-700 p-6">
          <div className="min-w-0">
            <h2 id="transaction-category-modal-title" className="text-xl font-bold text-white">
              Change category
            </h2>
            <div className="mt-1 truncate text-sm text-gray-400">
              {transaction.name} • {formattedDate} • {transaction.amount < 0 ? '-' : '+'}$
              {Math.abs(transaction.amount).toFixed(2)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 hover:text-white"
            aria-label="Close category editor"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-5">
            <div className="text-xs font-medium text-gray-400">Current category</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {transaction.category.length > 0 ? (
                transaction.category.map(value => (
                  <span
                    key={value}
                    className="inline-block rounded-full border border-[#102319]/12 bg-[#ecece4] px-2.5 py-1 text-xs text-[#56635b]"
                  >
                    {humanize(value)}
                  </span>
                ))
              ) : (
                <span className="text-xs italic text-gray-500">No category information available</span>
              )}
              {transaction.isUserCategory && (
                <span className="inline-block rounded-full border border-[#397052]/25 bg-[#c9f2df]/55 px-2.5 py-1 text-xs font-semibold text-[#285c43]">
                  Set by you
                </span>
              )}
            </div>
          </div>

          {loadError && (
            <div className="rounded border border-red-700/50 bg-red-900/30 p-3 text-sm text-red-300">
              {loadError}
            </div>
          )}

          {!loadError && !options && (
            <div className="py-6 text-center text-sm text-gray-400">Loading categories…</div>
          )}

          {options && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-white">Category</span>
                <select
                  ref={primaryRef}
                  value={primary}
                  onChange={event => handlePrimaryChange(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#102319]/15 bg-[#fffdf5] px-3 py-2 text-sm text-[#102319] focus:border-[#397052] focus:outline-none"
                >
                  <option value="">Select a category…</option>
                  {options.map(option => (
                    <option key={option.primary} value={option.primary}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-white">Subcategory</span>
                <select
                  value={detailed}
                  onChange={event => setDetailed(event.target.value)}
                  disabled={detailedOptions.length === 0}
                  className="mt-1 w-full rounded-lg border border-[#102319]/15 bg-[#fffdf5] px-3 py-2 text-sm text-[#102319] focus:border-[#397052] focus:outline-none disabled:opacity-50"
                >
                  <option value="">None</option>
                  {detailedOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {saveError && (
            <div className="mt-4 rounded border border-red-700/50 bg-red-900/30 p-3 text-sm text-red-300">
              {saveError}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-700 p-6">
          {transaction.isUserCategory && (
            <button
              onClick={() => void reset()}
              disabled={saving}
              className="mr-auto rounded-full px-4 py-2 text-sm font-semibold text-[#8b4137] underline disabled:opacity-50"
            >
              Restore original category
            </button>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-full bg-gray-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || !options || !primary}
            className="rounded-full bg-[#d9ff6f] px-4 py-2 text-sm font-semibold text-[#102319] hover:bg-[#cdef64] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save category'}
          </button>
        </div>
      </div>
    </div>
  );
}
