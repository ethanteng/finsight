"use client";

import { useEffect, useState } from 'react';
import InvestmentPortfolio from '../InvestmentPortfolio';
import type {
  FinancesAccount,
  FinancesAccountDetails,
} from '../../types/finances-overview';

interface AccountDetailModalProps {
  account: FinancesAccount;
  accountId: string;
  revisionId: string;
  onClose: () => void;
  onAccountRenamed?: () => void | Promise<void>;
}

function finiteBalance(account: FinancesAccount): number | null {
  if (Object.prototype.hasOwnProperty.call(account, 'displayBalance')) {
    return typeof account.displayBalance === 'number' && Number.isFinite(account.displayBalance)
      ? account.displayBalance
      : null;
  }
  if (typeof account.balance === 'number' && Number.isFinite(account.balance)) return account.balance;
  if (!account.balance || typeof account.balance !== 'object') return null;
  if (typeof account.balance.current === 'number' && Number.isFinite(account.balance.current)) {
    return account.balance.current;
  }
  return typeof account.balance.available === 'number' && Number.isFinite(account.balance.available)
    ? account.balance.available
    : null;
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

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const isInvestment = account.type?.toLowerCase() === 'investment';

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
  }, [API_URL, accountId]);

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
      alert(error instanceof Error ? error.message : 'Failed to rename account');
    } finally {
      setIsSavingName(false);
    }
  };

  const balance = finiteBalance(account);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-700 p-6">
          <div className="flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={editName}
                  onChange={event => setEditName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') void handleSaveName();
                    if (event.key === 'Escape') setIsEditingName(false);
                  }}
                  className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-2xl font-bold text-white"
                  disabled={isSavingName}
                  autoFocus
                />
                <button onClick={() => void handleSaveName()} disabled={isSavingName} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
                  {isSavingName ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setIsEditingName(false)} className="rounded bg-gray-600 px-3 py-1 text-sm text-white">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-white">{displayName}</h2>
                {account.source !== 'manual' && (
                  <button onClick={() => setIsEditingName(true)} className="text-gray-400 hover:text-white" title="Rename account">✏️</button>
                )}
              </div>
            )}
            <div className="mt-1 text-sm text-gray-400">
              {[account.institution, account.type, account.subtype].filter(Boolean).join(' • ')}
            </div>
            {!isInvestment && (
              <div className="mt-2 text-lg font-semibold text-white">
                Balance: {balance === null ? 'Unavailable' : formatCurrency(balance)}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-white" aria-label="Close account details">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && <div className="py-10 text-center text-gray-400">Loading account details...</div>}
          {loadError && <div className="rounded border border-red-700/50 bg-red-900/30 p-4 text-red-300">{loadError}</div>}
          {!loading && !loadError && details && details.revisionId !== revisionId && (
            <div className="mb-4 rounded border border-amber-700/40 bg-amber-900/20 p-3 text-sm text-amber-200">
              Account details come from a newer financial snapshot.
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
                      <div key={transactionId(transaction, index)} className="flex items-center justify-between rounded-lg border border-gray-600 bg-gray-700 p-4">
                        <div className="min-w-0 pr-4">
                          <div className="truncate font-medium text-white">{String(transaction.name || transaction.merchant_name || 'Transaction')}</div>
                          <div className="text-sm text-gray-400">{formatDate(transaction.date)} • {transactionCategory(transaction)}</div>
                        </div>
                        <div className="font-semibold text-white">{amount === null ? 'Unavailable' : formatCurrency(amount)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
