"use client";

/**
 * One "Add an account" button for both account providers.
 *
 * The accounts page used to carry a Plaid button and a SnapTrade button side by
 * side, which asked the user a question only we can answer: whether their bank
 * or brokerage is reachable through one integration or the other. This asks the
 * question they can answer -- which institution -- and routes from there.
 *
 * The routing is not a guess. `/api/institutions/search` returns one row per
 * (institution, provider) pair from the two providers' own directories, so a
 * row exists only where that provider really can connect that institution.
 * Several large firms appear twice, once for the bank side and once for the
 * brokerage side; the row's own description says which is which rather than
 * making the user infer it from a provider name they have no reason to know.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

export type ConnectionProvider = 'plaid' | 'snaptrade';

export interface InstitutionOption {
  id: string;
  provider: ConnectionProvider;
  name: string;
  providerInstitutionId: string;
  logoUrl: string | null;
  covers: string;
}

interface AddAccountButtonProps {
  /**
   * Open Plaid Link. The institution is passed for context only: Plaid has no
   * general pre-selection, so Link opens on its own institution picker and the
   * caller cannot skip that step.
   */
  onSelectPlaid: (institution: InstitutionOption | null) => void;
  /** Open the SnapTrade portal, already on this brokerage's slug when one is given. */
  onSelectSnapTrade: (institution: InstitutionOption) => void;
  /**
   * False while SnapTrade is still registering the user.
   *
   * Only changes what an investment row *says*, never whether it can be
   * clicked. Disabling them meant a transient failure during registration left
   * every brokerage permanently unreachable, with no control anywhere on the
   * page to retry; the request is now queued and retried instead.
   */
  snapTradeReady?: boolean;
  className?: string;
}

export interface AddAccountButtonRef {
  /**
   * Open the picker without a click.
   *
   * The "add accounts" deep link lands here: someone arriving from an empty
   * Finances page is exactly the person who does not yet know whether their
   * institution is a bank connection or an investment one, so the link opens
   * the picker rather than committing them to one provider's flow.
   */
  open: () => void;
}

/** Below this the search is noise, and the backend declines it anyway. */
const MIN_QUERY_LENGTH = 2;

/** Enough that a typist does not spend a provider call per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

const PROVIDER_LABEL: Record<ConnectionProvider, string> = {
  plaid: 'Bank connection',
  snaptrade: 'Investment connection',
};

function InstitutionLogo({ institution }: { institution: InstitutionOption }) {
  const [failed, setFailed] = useState(false);

  if (institution.logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={institution.logoUrl}
        alt=""
        aria-hidden="true"
        className="h-8 w-8 shrink-0 rounded bg-white object-contain p-0.5"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-600 text-sm font-semibold text-gray-200"
    >
      {institution.name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

const AddAccountButton = forwardRef<AddAccountButtonRef, AddAccountButtonProps>(function AddAccountButton({
  onSelectPlaid,
  onSelectSnapTrade,
  snapTradeReady = true,
  className,
}: AddAccountButtonProps, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InstitutionOption[]>([]);
  const [degradedProviders, setDegradedProviders] = useState<ConnectionProvider[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Every search is superseded by the next keystroke, so an in-flight one is
  // aborted rather than left to land out of order over a newer result.
  const inFlight = useRef<AbortController | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const trimmedQuery = query.trim();
  const queryIsSearchable = trimmedQuery.length >= MIN_QUERY_LENGTH;

  const close = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setDegradedProviders([]);
    setError(null);
    setIsSearching(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useImperativeHandle(ref, () => ({ open: () => setIsOpen(true) }), []);

  useEffect(() => {
    if (!isOpen) return;

    if (!queryIsSearchable) {
      inFlight.current?.abort();
      inFlight.current = null;
      setResults([]);
      setDegradedProviders([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(
          `${API_URL}/api/institutions/search?query=${encodeURIComponent(trimmedQuery)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          setResults([]);
          setDegradedProviders([]);
          setError('We could not search institutions just now. Please try again.');
          return;
        }

        const data = await response.json();
        setResults(Array.isArray(data.institutions) ? data.institutions : []);
        setDegradedProviders(Array.isArray(data.degradedProviders) ? data.degradedProviders : []);
        setError(null);
      } catch (searchError) {
        // An abort is this component replacing its own request, not a failure
        // the user should be told about.
        if ((searchError as Error)?.name === 'AbortError') return;
        console.error('Institution search failed:', searchError);
        setResults([]);
        setDegradedProviders([]);
        setError('We could not search institutions just now. Please try again.');
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setIsSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // Abort here too, not only when the next debounce fires. Once the fetch
      // has started, clearing the timer no longer stops anything: the reply for
      // the old query could land during the debounce window and repaint the
      // list with institutions that do not match what is now typed -- briefly
      // clickable, and wrong.
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [API_URL, isOpen, queryIsSearchable, trimmedQuery]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const select = useCallback(
    (institution: InstitutionOption) => {
      // Close first: both provider flows open their own modal, and two stacked
      // overlays leave the page scroll-locked behind whichever closes second.
      close();
      if (institution.provider === 'snaptrade') {
        onSelectSnapTrade(institution);
      } else {
        onSelectPlaid(institution);
      }
    },
    [close, onSelectPlaid, onSelectSnapTrade],
  );

  const degradedNotice = useMemo(() => {
    if (degradedProviders.length === 0) return null;
    return degradedProviders.includes('plaid') && degradedProviders.includes('snaptrade')
      ? 'We could not reach either provider, so no institutions are listed. Please try again in a moment.'
      : degradedProviders.includes('plaid')
        ? 'Bank institutions could not be loaded just now, so this list may be missing some. Investment institutions are unaffected.'
        : 'Investment institutions could not be loaded just now, so this list may be missing some. Banks are unaffected.';
  }, [degradedProviders]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
      >
        Add an account
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-6"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-title"
            className="mt-10 w-full max-w-lg rounded-lg border border-gray-700 bg-gray-800 p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="add-account-title" className="text-lg font-semibold text-white">
                  Add an account
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Search for your bank or brokerage and we&apos;ll open the right connection for it.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="shrink-0 rounded px-2 py-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
              >
                ✕
              </button>
            </div>

            <label htmlFor="institution-search" className="sr-only">
              Search institutions
            </label>
            <input
              id="institution-search"
              ref={inputRef}
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search e.g. Chase, Fidelity, Schwab"
              autoComplete="off"
              className="mt-4 w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
            />

            <div className="mt-4 max-h-80 overflow-y-auto" aria-live="polite">
              {!queryIsSearchable ? (
                <p className="px-1 py-6 text-center text-sm text-gray-400">
                  Start typing your institution&apos;s name.
                </p>
              ) : isSearching ? (
                <p className="px-1 py-6 text-center text-sm text-gray-400">Searching…</p>
              ) : error ? (
                <p className="px-1 py-6 text-center text-sm text-red-400">{error}</p>
              ) : results.length === 0 ? (
                <div className="px-1 py-6 text-center text-sm text-gray-400">
                  <p>No institutions matched &ldquo;{trimmedQuery}&rdquo;.</p>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      // Plaid Link's own directory is larger than what a name
                      // search surfaces, so this is a real second chance rather
                      // than a dead end.
                      onSelectPlaid(null);
                    }}
                    className="mt-3 text-green-400 underline underline-offset-2 hover:text-green-300"
                  >
                    Browse all banks instead
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {results.map(institution => {
                    // Still clickable: the request is queued and retried once
                    // registration lands, so this is a note about what will
                    // happen, not a closed door.
                    const settingUp = institution.provider === 'snaptrade' && !snapTradeReady;
                    return (
                      <li key={institution.id}>
                        <button
                          type="button"
                          onClick={() => select(institution)}
                          className="flex w-full items-center gap-3 rounded-lg border border-gray-600 bg-gray-700 p-3 text-left transition-colors hover:border-green-600 hover:bg-gray-600"
                        >
                          <InstitutionLogo institution={institution} />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-medium text-white">
                              {institution.name}
                            </span>
                            <span className="block text-xs text-gray-400">
                              {settingUp
                                ? `${institution.covers} — still setting up, this may take a moment`
                                : institution.covers}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-gray-500 px-2 py-0.5 text-[11px] text-gray-300">
                            {PROVIDER_LABEL[institution.provider]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {degradedNotice && (
                <p className="mt-3 rounded border border-yellow-700 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-300">
                  {degradedNotice}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default AddAccountButton;
