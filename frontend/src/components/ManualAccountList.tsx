"use client";
import { useState, lazy, Suspense } from 'react';
import type { ManualAccount } from '../types/manual-account';

const ManualAccountForm = lazy(() => import('./ManualAccountForm'));

interface ManualAccountListProps {
  accounts: ManualAccount[];
  onRefresh: () => void;
  isDemo?: boolean;
}

export default function ManualAccountList({ accounts, onRefresh, isDemo = false }: ManualAccountListProps) {
  const [editingAccount, setEditingAccount] = useState<ManualAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this account?')) {
      return;
    }

    setDeletingId(id);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('auth_token');
      if (!token) {
        alert('Authentication required. Please log in again.');
        setDeletingId(null);
        return;
      }
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      const response = await fetch(`${API_URL}/api/manual-accounts/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (response.ok) {
        onRefresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete account');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'cash':
        return 'Cash';
      case 'investment':
        return 'Investment';
      case 'debt':
        return 'Debt';
      default:
        return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'cash':
        return 'text-green-400';
      case 'investment':
        return 'text-blue-400';
      case 'debt':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (showForm || editingAccount) {
    return (
      <Suspense fallback={<div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-gray-400">Loading form...</div>}>
        <ManualAccountForm
          account={editingAccount}
          onSuccess={() => {
            setShowForm(false);
            setEditingAccount(null);
            onRefresh();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingAccount(null);
          }}
          isDemo={isDemo}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Manual Accounts</h3>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm"
        >
          + Add Manual Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center text-gray-400">
          <p>No manual accounts yet.</p>
          <p className="text-sm mt-2">Click "Add Manual Account" to create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-white truncate">{account.name}</h4>
                  <span className={`text-xs px-2 py-1 rounded ${getTypeColor(account.type)} bg-gray-700`}>
                    {getTypeLabel(account.type)}
                  </span>
                </div>
                <p className={`text-lg font-semibold ${getTypeColor(account.type)}`}>
                  {formatCurrency(account.amount)}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => setEditingAccount(account)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                  disabled={deletingId === account.id}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                  disabled={deletingId === account.id}
                >
                  {deletingId === account.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
