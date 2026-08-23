"use client";
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { FinancesAccount } from '../../types/finances-overview';
import { resolveAccountBalance } from '../../lib/account-balance';
import { formatAccountAsOf } from '../../lib/account-as-of';
import { useDialog } from '../ui/dialog';

export type Account = FinancesAccount;

interface AccountGroupCardProps {
  title: string;
  accounts: FinancesAccount[];
  totalBalance: number | null;
  unavailableBalanceCount?: number;
  isExpanded: boolean;
  onToggle: () => void;
  onAccountClick: (accountId: string) => void;
  onAccountRenamed?: () => void;
}

// Match canonical metrics: current is authoritative, available is only a fallback.
export function getAccountBalance(account: FinancesAccount): number | null {
  return resolveAccountBalance(account);
}

export default function AccountGroupCard({
  title,
  accounts,
  totalBalance,
  unavailableBalanceCount = 0,
  isExpanded,
  onToggle,
  onAccountClick,
  onAccountRenamed
}: AccountGroupCardProps) {
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const { showError, dialog } = useDialog();
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getAccountName = (account: FinancesAccount): string => {
    return account.name || 'Unknown Account';
  };

  const getAccountInstitution = (account: FinancesAccount): string => {
    return account.institution || '';
  };

  const getAccountId = (account: FinancesAccount): string => {
    return account.account_id || account.id || '';
  };

  const handleStartEdit = (account: FinancesAccount, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onAccountClick
    const accountId = getAccountId(account);
    setEditingAccountId(accountId);
    setEditName(getAccountName(account));
  };

  const handleCancelEdit = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setEditingAccountId(null);
    setEditName('');
  };

  const handleSaveEdit = async (accountId: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    
    if (!editName.trim()) {
      void showError('Account name cannot be empty', { title: 'Name required' });
      return;
    }

    setIsSaving(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        void showError('Authentication required. Please log in again.');
        setIsSaving(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/accounts/${encodeURIComponent(accountId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (response.ok) {
        await response.json();
        setEditingAccountId(null);
        setEditName('');
        // Trigger refresh of accounts
        if (onAccountRenamed) {
          await onAccountRenamed();
        }
      } else {
        const data = await response.json();
        console.error('❌ Failed to rename account:', data);
        void showError(data.error || 'Failed to rename account');
      }
    } catch (error) {
      console.error('Error renaming account:', error);
      void showError('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-lg p-4 transition-colors hover:bg-gray-750"
      >
        <div className="flex min-w-0 items-center space-x-3 sm:space-x-4">
          <div className="text-lg">{isExpanded ? '▼' : '▶'}</div>
          <div className="min-w-0 text-left">
            <h3 className="break-words text-base font-semibold text-white sm:text-lg">{title}</h3>
            <div className="text-sm text-gray-400">
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold text-white sm:text-xl">
            {totalBalance === null ? 'Unavailable' : formatCurrency(totalBalance)}
          </div>
          {unavailableBalanceCount > 0 && (
            <div className="text-xs text-amber-300">
              Partial total · {unavailableBalanceCount} unavailable
            </div>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-3">
          {accounts.map((account) => {
            const accountId = getAccountId(account);
            const balance = getAccountBalance(account);
            const name = getAccountName(account);
            const institution = getAccountInstitution(account);
            const asOf = formatAccountAsOf(account);

            const isEditing = editingAccountId === accountId;

            return (
              <div
                key={accountId}
                onClick={() => !isEditing && onAccountClick(accountId)}
                className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEdit(accountId, e);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit(e);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                          autoFocus
                          disabled={isSaving}
                        />
                        <button
                          onClick={(e) => handleSaveEdit(accountId, e)}
                          disabled={isSaving}
                          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={isSaving}
                          className="px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-start gap-1.5">
                        <div className="min-w-0 break-words font-medium text-white">{name}</div>
                        {account.source !== 'manual' && (
                          /* The icon stays at the name's line height so it reads as an
                             affordance rather than a second heading. `!min-h-0` opts out of
                             the mobile 44px button floor in globals.css — that floor would
                             stretch this button to 44px and pad every row out — and the
                             `after` box restores a 40px touch target without taking layout
                             space. */
                          <button
                            onClick={(e) => handleStartEdit(account, e)}
                            className="relative grid h-6 w-6 shrink-0 place-items-center rounded text-gray-500 transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-[#102319] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-1 !min-h-0"
                            title="Rename account"
                            aria-label={`Rename ${name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )}
                    {institution && !isEditing && (
                      <div className="text-sm text-gray-400">{institution}</div>
                    )}
                    {asOf && !isEditing && (
                      <div
                        className={`text-xs ${asOf.isStale ? 'text-amber-300' : 'text-gray-500'}`}
                        title={asOf.title}
                      >
                        {asOf.label}
                      </div>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="shrink-0 text-right">
                      <div className="font-semibold text-white">
                        {balance === null ? 'Unavailable' : formatCurrency(balance)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog}
    </div>
  );
}
