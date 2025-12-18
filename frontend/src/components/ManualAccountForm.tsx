"use client";
import { useState, useEffect, useCallback } from 'react';
import type { ManualAccount } from '../types/manual-account';

interface ManualAccountFormProps {
  account?: ManualAccount | null;
  onSuccess: () => void;
  onCancel: () => void;
  isDemo?: boolean;
}

export default function ManualAccountForm({ account, onSuccess, onCancel, isDemo = false }: ManualAccountFormProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'cash' | 'investment' | 'debt'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const formatAmount = useCallback((value: number): string => {
    // Format number with commas for display
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setAmount(formatAmount(account.amount));
      setType(account.type);
    }
  }, [account, formatAmount]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow numbers, commas, and decimal points
    const value = e.target.value.replace(/[^0-9,.]/g, '');
    setAmount(value);
  };

  const parseAmount = (amountStr: string): number => {
    // Remove commas and parse as float
    const cleaned = amountStr.replace(/,/g, '');
    return parseFloat(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const amountNum = parseAmount(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        setError('Amount must be a valid positive number');
        setIsSubmitting(false);
        return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('Authentication required. Please log in again.');
        setIsSubmitting(false);
        return;
      }
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      const url = account 
        ? `${API_URL}/api/manual-accounts/${account.id}`
        : `${API_URL}/api/manual-accounts`;
      
      const method = account ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          name: name.trim(),
          amount: amountNum,
          type,
        }),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save account');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">
        {account ? 'Edit Manual Account' : 'Add Manual Account'}
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
            Institution Name or Description
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Emergency Fund, Crypto Wallet, Personal Loan"
          />
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-2">
            Amount ($)
          </label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={handleAmountChange}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
            pattern="[0-9,]*\.?[0-9]*"
          />
          {type === 'debt' && (
            <p className="mt-1 text-xs text-gray-400">
              Enter the amount owed (will be treated as positive debt)
            </p>
          )}
        </div>

        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-300 mb-2">
            Account Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as 'cash' | 'investment' | 'debt')}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="cash">Cash</option>
            <option value="investment">Investment</option>
            <option value="debt">Debt</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            {isSubmitting ? 'Saving...' : account ? 'Update Account' : 'Add Account'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
