"use client";
import { useState } from 'react';

interface Account {
  id: string;
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  balance: {
    current: number;
    available?: number;
    limit?: number;
    iso_currency_code: string;
  };
  institution?: string;
  source?: 'plaid' | 'snaptrade';
}

interface SnapTradeAccount {
  id: string;
  name: string;
  type: string;
  institution: string;
  balance: number;
  accountNumber: string;
}

interface AccountGroupCardProps {
  title: string;
  accounts: (Account | SnapTradeAccount)[];
  totalBalance: number;
  isExpanded: boolean;
  onToggle: () => void;
  onAccountClick: (accountId: string) => void;
  onAccountRenamed?: () => void;
}

export default function AccountGroupCard({
  title,
  accounts,
  totalBalance,
  isExpanded,
  onToggle,
  onAccountClick,
  onAccountRenamed
}: AccountGroupCardProps) {
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getAccountBalance = (account: Account | SnapTradeAccount): number => {
    if ('balance' in account && typeof account.balance === 'object') {
      const acc = account as Account;
      // For checking/savings accounts, prefer available balance
      if (acc.type === 'depository' || 
          acc.subtype === 'checking' || 
          acc.subtype === 'savings') {
        return acc.balance.available !== undefined && acc.balance.available !== null 
          ? acc.balance.available 
          : acc.balance.current ?? 0;
      }
      // For investment/credit/loan accounts, use current balance
      return acc.balance.current ?? 0;
    }
    return (account as SnapTradeAccount).balance ?? 0;
  };

  const getAccountName = (account: Account | SnapTradeAccount): string => {
    return account.name || 'Unknown Account';
  };

  const getAccountInstitution = (account: Account | SnapTradeAccount): string => {
    if ('institution' in account && account.institution) {
      return account.institution;
    }
    // Check if it's a SnapTradeAccount by looking for accountNumber property
    if ('accountNumber' in account && 'institution' in account) {
      return (account as SnapTradeAccount).institution || '';
    }
    return '';
  };

  const getAccountId = (account: Account | SnapTradeAccount): string => {
    // Check if it's an Account type
    if ('account_id' in account) {
      return (account as Account).account_id || (account as Account).id || '';
    }
    // Otherwise it's a SnapTradeAccount
    return (account as SnapTradeAccount).id || '';
  };

  const handleStartEdit = (account: Account | SnapTradeAccount, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onAccountClick
    const accountId = getAccountId(account);
    setEditingAccountId(accountId);
    setEditName(getAccountName(account));
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAccountId(null);
    setEditName('');
  };

  const handleSaveEdit = async (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!editName.trim()) {
      alert('Account name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        alert('Authentication required. Please log in again.');
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
        setEditingAccountId(null);
        setEditName('');
        // Trigger refresh of accounts
        if (onAccountRenamed) {
          onAccountRenamed();
        }
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to rename account');
      }
    } catch (error) {
      console.error('Error renaming account:', error);
      alert('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-750 transition-colors rounded-lg"
      >
        <div className="flex items-center space-x-4">
          <div className="text-lg">{isExpanded ? '▼' : '▶'}</div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <div className="text-sm text-gray-400">
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-semibold text-xl">
            {formatCurrency(totalBalance)}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-3">
          {accounts.map((account) => {
            const accountId = getAccountId(account);
            const balance = getAccountBalance(account);
            const name = getAccountName(account);
            const institution = getAccountInstitution(account);

            const isEditing = editingAccountId === accountId;

            return (
              <div
                key={accountId}
                onClick={() => !isEditing && onAccountClick(accountId)}
                className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEdit(accountId, e as any);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit(e as any);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 px-2 py-1 bg-gray-800 text-white border border-gray-600 rounded focus:outline-none focus:border-blue-500"
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
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-white">{name}</div>
                        <button
                          onClick={(e) => handleStartEdit(account, e)}
                          className="text-gray-400 hover:text-white text-sm transition-opacity"
                          title="Rename account"
                        >
                          ✏️
                        </button>
                      </div>
                    )}
                    {institution && !isEditing && (
                      <div className="text-sm text-gray-400">{institution}</div>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="text-right">
                      <div className="font-semibold text-white">
                        {formatCurrency(balance)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

