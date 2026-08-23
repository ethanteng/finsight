"use client";

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import InvestmentPortfolio from '../InvestmentPortfolio';
import { useDialog } from '../ui/dialog';
import type {
  FinancesAccount,
  FinancesAccountDetails,
} from '../../types/finances-overview';
import { resolveAccountBalance } from '../../lib/account-balance';
import { formatAccountAsOf } from '../../lib/account-as-of';

interface AccountDetailModalProps {
  account: FinancesAccount;
  accountId: string;
  revisionId: string;
  onClose: () => void;
  onAccountRenamed?: () => void | Promise<void>;
}

function finiteBalance(account: FinancesAccount): number | null {
  return resolveAccountBalance(account);
}

function transactionId(transaction: Record<string, unknown>, index: number): string {
  return String(transaction.transaction_id || transaction.id || `${transaction.date || 'transaction'}-${index}`);
}

function transactionCategory(transaction: Record<string, unknown>): string {
  const enriched = transaction.enriched_data && typeof transaction.enriched_data === 'object'
    ? transaction.enriched_data as Record<string, unknown>
    : null;
  const raw = enriched?.category || transaction.category;
  if (Array.isArray(raw)) return raw.filter(Boolean).join(' › ') || 'Uncategorized';
  return typeof raw === 'string' && raw.trim() ? raw : 'Uncategorized';
}

export default function AccountDetailModal({
  account,
  accountId,
  revisionId,
  onClose,
  onAccountRenamed,
}: AccountDetailModalProps) {
  const [details, setDetails] = useState<FinancesAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(account.name || 'Unknown Account');
  const [editName, setEditName] = useState(account.name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const { showError, dialog } = useDialog();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const isInvestment = account.type?.toLowerCase() === 'investment';
  const asOf = formatAccountAsOf(account);
  // Only SnapTrade exposes a manual re-sync, and only through the brokerage
  // authorization -- an account whose snapshot predates that field has nothing
  // to send, so it gets no button rather than one that cannot work.
  const refreshableConnectionId = account.source === 'snaptrade' && account.brokerageAuthorizationId
    ? account.brokerageAuthorizationId
    : null;

  useEffect(() => {
    let cancelled = false;
    const loadDetails = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(
          `${API_URL}/api/finances/accounts/${encodeURIComponent(accountId)}/details`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) throw new Error('Account details are unavailable');
        const data = await response.json() as FinancesAccountDetails;
        if (!cancelled) setDetails(data);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load account details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadDetails();
    return () => { cancelled = true; };
  }, [API_URL, accountId, revisionId]);

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  const formatDate = (value: unknown) => {
    const date = new Date(String(value || ''));
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setIsSavingName(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/accounts/${encodeURIComponent(accountId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to rename account');
      }
      setDisplayName(editName.trim());
      setIsEditingName(false);
      await onAccountRenamed?.();
    } catch (error) {
      void showError(error instanceof Error ? error.message : 'Failed to rename account');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleRefreshConnection = async () => {
    if (!refreshableConnectionId) return;
    setIsRefreshing(true);
    setRefreshNotice(null);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `${API_URL}/snaptrade/connections/${encodeURIComponent(refreshableConnectionId)}/refresh`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to request a refresh');
      // The provider only schedules the syncs, so this never claims the numbers
      // on screen just changed -- saying so would send the user off to compare
      // against a balance that has not moved yet.
      setRefreshNotice(data.message || 'Refresh requested.');
    } catch (error) {
      void showError(error instanceof Error ? error.message : 'Failed to request a refresh');
    } finally {
      setIsRefreshing(false);
    }
  };

  const balance = finiteBalance(account);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-gray-800 sm:max-h-[90vh]">
        <div className="flex items-start justify-between gap-3 border-b border-gray-700 p-4 sm:p-6">
          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={editName}
                  onChange={event => setEditName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') void handleSaveName();
                    if (event.key === 'Escape') setIsEditingName(false);
                  }}
                  className="min-w-0 rounded border border-gray-600 bg-gray-700 px-3 py-2 text-lg font-bold text-white sm:flex-1 sm:text-2xl"
                  disabled={isSavingName}
                  autoFocus
                />
                <button onClick={() => void handleSaveName()} disabled={isSavingName} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
                  {isSavingName ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setIsEditingName(false)} className="rounded bg-gray-600 px-3 py-1 text-sm text-white">Cancel</button>
              </div>
            ) : (
              <div className="flex min-w-0 items-start gap-2">
                <h2 className="min-w-0 break-words text-xl font-bold text-white sm:text-2xl">{displayName}</h2>
                {account.source !== 'manual' && (
                  /* Sized to the heading's line box so it aligns with the first line of a
                     wrapped name. See AccountGroupCard for why `!min-h-0` and `after`. */
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-gray-400 transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-gray-700 hover:text-[#102319] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-1 sm:h-8 sm:w-8 !min-h-0"
                    title="Rename account"
                    aria-label={`Rename ${displayName}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            <div className="mt-1 text-sm text-gray-400">
              {[account.institution, account.type, account.subtype].filter(Boolean).join(' • ')}
            </div>
            {(asOf || refreshableConnectionId) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {asOf && (
                  <span className={`text-xs ${asOf.isStale ? 'text-amber-300' : 'text-gray-500'}`} title={asOf.title}>
                    {asOf.label}
                  </span>
                )}
                {refreshableConnectionId && (
                  <button
                    onClick={() => void handleRefreshConnection()}
                    disabled={isRefreshing}
                    className="text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300 disabled:opacity-50"
                  >
                    {isRefreshing ? 'Requesting refresh...' : 'Refresh from institution'}
                  </button>
                )}
              </div>
            )}
            {refreshNotice && (
              <div className="mt-2 text-xs text-gray-400">{refreshNotice}</div>
            )}
            {!isInvestment && (
              <div className="mt-2 text-lg font-semibold text-white">
                Balance: {balance === null ? 'Unavailable' : formatCurrency(balance)}
              </div>
            )}
          </div>
          <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-2xl text-gray-400 hover:bg-gray-700 hover:text-[#102319]" aria-label="Close account details">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading && <div className="py-10 text-center text-gray-400">Loading account details...</div>}
          {loadError && <div className="rounded border border-red-700/50 bg-red-900/30 p-4 text-red-300">{loadError}</div>}
          {!loading && !loadError && details && details.revisionId !== revisionId && (
            <div className="mb-4 rounded border border-amber-700/40 bg-amber-900/20 p-3 text-sm text-amber-200">
              Account details are from a different snapshot revision than the overview.
            </div>
          )}
          {!loading && !loadError && details && isInvestment && (
            <InvestmentPortfolio
              portfolio={details.portfolio}
              holdings={details.holdings as never[]}
              transactions={details.investmentTransactions as never[]}
            />
          )}
          {!loading && !loadError && details && !isInvestment && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-white">Transactions</h3>
              {details.transactions.length === 0 ? (
                <div className="rounded-lg bg-gray-700 p-6 text-center text-gray-400">No transactions in this snapshot window.</div>
              ) : (
                <div className="space-y-2">
                  {details.transactions.map((transaction, index) => {
                    const amount = typeof transaction.amount === 'number' && Number.isFinite(transaction.amount)
                      ? transaction.amount
                      : null;
                    return (
                      <div key={transactionId(transaction, index)} className="flex items-center justify-between gap-3 rounded-lg border border-gray-600 bg-gray-700 p-4">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{String(transaction.name || transaction.merchant_name || 'Transaction')}</div>
                          <div className="text-sm text-gray-400">{formatDate(transaction.date)} • {transactionCategory(transaction)}</div>
                        </div>
                        <div className="shrink-0 font-semibold text-white">{amount === null ? 'Unavailable' : formatCurrency(amount)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {dialog}
    </div>
  );
}
