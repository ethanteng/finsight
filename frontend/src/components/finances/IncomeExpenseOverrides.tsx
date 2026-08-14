"use client";

import { useState, useEffect } from 'react';

interface IncomeExpenseOverridesProps {
  calculatedIncome: number | null;
  calculatedExpense: number | null;
  initialMonthlyIncome: number | null;
  initialMonthlyExpense: number | null;
}

export default function IncomeExpenseOverrides({
  calculatedIncome,
  calculatedExpense,
  initialMonthlyIncome,
  initialMonthlyExpense,
}: IncomeExpenseOverridesProps) {
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(initialMonthlyIncome);
  const [monthlyExpense, setMonthlyExpense] = useState<number | null>(initialMonthlyExpense);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [isEditingExpense, setIsEditingExpense] = useState(false);
  const [editIncomeValue, setEditIncomeValue] = useState('');
  const [editExpenseValue, setEditExpenseValue] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => setMonthlyIncome(initialMonthlyIncome), [initialMonthlyIncome]);
  useEffect(() => setMonthlyExpense(initialMonthlyExpense), [initialMonthlyExpense]);

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) {
      return 'N/A';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleSaveIncome = async () => {
    const numericValue = parseFloat(editIncomeValue.replace(/[^0-9.]/g, ''));
    
    if (isNaN(numericValue) || numericValue < 0) {
      setError('Please enter a valid non-negative number');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/finances/overrides`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ monthlyIncome: numericValue })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update income override');
      }

      const data = await response.json();
      setMonthlyIncome(data.monthlyIncome);
      setIsEditingIncome(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update income override');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveExpense = async () => {
    const numericValue = parseFloat(editExpenseValue.replace(/[^0-9.]/g, ''));
    
    if (isNaN(numericValue) || numericValue < 0) {
      setError('Please enter a valid non-negative number');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/finances/overrides`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ monthlyExpense: numericValue })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update expense override');
      }

      const data = await response.json();
      setMonthlyExpense(data.monthlyExpense);
      setIsEditingExpense(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update expense override');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearIncome = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/finances/overrides`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ monthlyIncome: null })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to clear income override');
      }

      const data = await response.json();
      setMonthlyIncome(data.monthlyIncome);
      setIsEditingIncome(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear income override');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearExpense = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/finances/overrides`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ monthlyExpense: null })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to clear expense override');
      }

      const data = await response.json();
      setMonthlyExpense(data.monthlyExpense);
      setIsEditingExpense(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear expense override');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelIncome = () => {
    setEditIncomeValue('');
    setIsEditingIncome(false);
    setError(null);
  };

  const handleCancelExpense = () => {
    setEditExpenseValue('');
    setIsEditingExpense(false);
    setError(null);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">Monthly Income & Expense Overrides</h3>
      <p className="text-gray-400 text-sm mb-6">
        Override calculated values that are passed to GPT context. When set, these values will be used instead of calculated values from your transactions.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Monthly Income Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-gray-300 font-medium">Monthly Income</label>
            {monthlyIncome !== null && (
              <span className="px-2 py-1 bg-blue-900/30 text-blue-300 text-xs rounded border border-blue-700/50">
                Manual Override
              </span>
            )}
          </div>
          
          {isEditingIncome ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editIncomeValue}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = value.split('.');
                  if (parts.length > 2) {
                    value = parts[0] + '.' + parts[1];
                  }
                  setEditIncomeValue(value);
                  setError(null);
                }}
                className="w-full bg-gray-700 text-white text-xl font-semibold px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="Enter monthly income"
                disabled={isSaving}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveIncome}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancelIncome}
                  disabled={isSaving}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-white font-semibold text-xl mb-1">
                {monthlyIncome !== null ? formatCurrency(monthlyIncome) : formatCurrency(calculatedIncome)}
              </div>
              {monthlyIncome === null && calculatedIncome !== undefined && (
                <div className="text-gray-500 text-sm">
                  Calculated from transactions
                </div>
              )}
              {monthlyIncome !== null && (
                <div className="text-gray-500 text-sm">
                  Using manual override
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setEditIncomeValue(monthlyIncome !== null ? monthlyIncome.toString() : (calculatedIncome?.toString() || ''));
                    setIsEditingIncome(true);
                  }}
                  className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                >
                  {monthlyIncome !== null ? 'Edit Override' : 'Set Override'}
                </button>
                {monthlyIncome !== null && (
                  <button
                    onClick={handleClearIncome}
                    disabled={isSaving}
                    className="text-gray-400 hover:text-gray-300 text-sm transition-colors disabled:opacity-50"
                  >
                    Clear Override
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Monthly Expense Section */}
        <div className="pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <label className="text-gray-300 font-medium">Monthly Expenses</label>
            {monthlyExpense !== null && (
              <span className="px-2 py-1 bg-blue-900/30 text-blue-300 text-xs rounded border border-blue-700/50">
                Manual Override
              </span>
            )}
          </div>
          
          {isEditingExpense ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editExpenseValue}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = value.split('.');
                  if (parts.length > 2) {
                    value = parts[0] + '.' + parts[1];
                  }
                  setEditExpenseValue(value);
                  setError(null);
                }}
                className="w-full bg-gray-700 text-white text-xl font-semibold px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="Enter monthly expenses"
                disabled={isSaving}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveExpense}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancelExpense}
                  disabled={isSaving}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-white font-semibold text-xl mb-1">
                {monthlyExpense !== null ? formatCurrency(monthlyExpense) : formatCurrency(calculatedExpense)}
              </div>
              {monthlyExpense === null && calculatedExpense !== undefined && (
                <div className="text-gray-500 text-sm">
                  Calculated from transactions
                </div>
              )}
              {monthlyExpense !== null && (
                <div className="text-gray-500 text-sm">
                  Using manual override
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setEditExpenseValue(monthlyExpense !== null ? monthlyExpense.toString() : (calculatedExpense?.toString() || ''));
                    setIsEditingExpense(true);
                  }}
                  className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                >
                  {monthlyExpense !== null ? 'Edit Override' : 'Set Override'}
                </button>
                {monthlyExpense !== null && (
                  <button
                    onClick={handleClearExpense}
                    disabled={isSaving}
                    className="text-gray-400 hover:text-gray-300 text-sm transition-colors disabled:opacity-50"
                  >
                    Clear Override
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
