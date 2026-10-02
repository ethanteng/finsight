"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import ManualIndicator from '../ui/ManualIndicator';
import { monthLabel } from '../../lib/cash-flow-format';
import type { ExpectedMonthlySummary } from '../../types/cash-flow';

/** What actually happened: averages over the calendar months the snapshot covers in full. */
export interface MonthlyHistory {
  income: number | null;
  expense: number | null;
  monthCount: number;
  firstMonth: string | null;
  lastMonth: string | null;
}

interface IncomeExpenseOverridesProps {
  history: MonthlyHistory;
  initialMonthlyIncome: number | null;
  initialMonthlyExpense: number | null;
}

type Side = 'income' | 'expense';

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

/** "Aug–Sep 2026", "Oct 2025–Sep 2026" or "Sep 2026". */
function historySpan(history: MonthlyHistory): string | null {
  if (!history.firstMonth || !history.lastMonth) return null;
  const first = monthLabel(history.firstMonth);
  const last = monthLabel(history.lastMonth);
  if (history.firstMonth === history.lastMonth) return last;
  return history.firstMonth.slice(0, 4) === history.lastMonth.slice(0, 4)
    ? `${first.split(' ')[0]}–${last}`
    : `${first}–${last}`;
}

/**
 * Monthly income and expenses as the Cash Flow forecast expects them, beside
 * what actually happened. The forecast is the figure Ask Linc plans with; an
 * override replaces it there and in the forecast alike.
 */
export default function IncomeExpenseOverrides({
  history,
  initialMonthlyIncome,
  initialMonthlyExpense,
}: IncomeExpenseOverridesProps) {
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(initialMonthlyIncome);
  const [monthlyExpense, setMonthlyExpense] = useState<number | null>(initialMonthlyExpense);
  // Undefined while loading; null when there is no forecast to show.
  const [expected, setExpected] = useState<ExpectedMonthlySummary | null | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Side | null>(null);
  const [editValue, setEditValue] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => setMonthlyIncome(initialMonthlyIncome), [initialMonthlyIncome]);
  useEffect(() => setMonthlyExpense(initialMonthlyExpense), [initialMonthlyExpense]);

  const loadExpected = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/cash-flow/expected-monthly`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setExpected(response.ok && response.status !== 204 ? await response.json() : null);
    } catch {
      setExpected(null);
    }
  }, [API_URL]);

  useEffect(() => { void loadExpected(); }, [loadExpected]);

  /** Save an override, or clear it with null. */
  const saveOverride = async (side: Side, value: number | null) => {
    const field = side === 'income' ? 'monthlyIncome' : 'monthlyExpense';
    const noun = side === 'income' ? 'income' : 'expense';
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
        body: JSON.stringify({ [field]: value })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${value === null ? 'clear' : 'update'} ${noun} override`);
      }

      const data = await response.json();
      if (side === 'income') setMonthlyIncome(data.monthlyIncome);
      else setMonthlyExpense(data.monthlyExpense);
      setEditing(null);
      // The forecast uses the override, so what it expects has changed.
      void loadExpected();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${value === null ? 'clear' : 'update'} ${noun} override`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = (side: Side) => {
    const numericValue = parseFloat(editValue.replace(/[^0-9.]/g, ''));
    if (isNaN(numericValue) || numericValue < 0) {
      setError('Please enter a valid non-negative number');
      return;
    }
    void saveOverride(side, numericValue);
  };

  const handleCancel = () => {
    setEditValue('');
    setEditing(null);
    setError(null);
  };

  const span = historySpan(history);

  const renderSide = (side: Side) => {
    const title = side === 'income' ? 'Monthly Income' : 'Monthly Expenses';
    const override = side === 'income' ? monthlyIncome : monthlyExpense;
    const forecast = expected ? (side === 'income' ? expected.income : expected.spending) : null;
    const forecastSource = expected ? (side === 'income' ? expected.incomeSource : expected.spendingSource) : null;
    // What the forecast expects from the transactions alone. It holds while the
    // forecast reloads after an override is saved or cleared: before, the side
    // read from transactions; after, `learned` says what it would read.
    const learned = forecastSource === 'transactions'
      ? forecast
      : expected?.learned ? (side === 'income' ? expected.learned.income : expected.learned.spending) : null;
    const historical = side === 'income' ? history.income : history.expense;
    const shown = override !== null
      ? { value: override, basis: 'override' as const }
      : expected === undefined
        ? { value: null, basis: 'loading' as const }
        : learned !== null
          ? { value: learned, basis: 'forecast' as const }
          : { value: historical, basis: 'history' as const };

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-gray-300 font-medium">{title}</label>
          {override !== null && (
            <ManualIndicator label="Manual override" />
          )}
        </div>

        {editing === side ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editValue}
              onChange={(e) => {
                let value = e.target.value.replace(/[^0-9.]/g, '');
                const parts = value.split('.');
                if (parts.length > 2) {
                  value = parts[0] + '.' + parts[1];
                }
                setEditValue(value);
                setError(null);
              }}
              className="w-full bg-gray-700 text-white text-xl font-semibold px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              placeholder={side === 'income' ? 'Enter monthly income' : 'Enter monthly expenses'}
              disabled={isSaving}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSave(side)}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
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
              {shown.basis === 'loading' ? '…' : formatCurrency(shown.value)}
            </div>
            {shown.basis === 'override' && (
              <div className="text-gray-500 text-sm">
                Your override. Your Cash Flow forecast and Ask Linc use it.
              </div>
            )}
            {shown.basis === 'forecast' && (
              <div className="text-gray-500 text-sm">
                Expected in a typical month, from your Cash Flow forecast
              </div>
            )}
            {shown.basis === 'history' && shown.value !== null && span && (
              <div className="text-gray-500 text-sm">
                Your average over {span}. Your Cash Flow forecast isn’t available yet.
              </div>
            )}
            {shown.basis === 'override' && learned !== null && (
              <div className="text-gray-500 text-sm">
                From your transactions, the forecast would expect {formatCurrency(learned)}
              </div>
            )}
            {shown.basis !== 'history' && historical !== null && span && (
              <div className="text-gray-500 text-sm">
                You averaged {formatCurrency(historical)} a month over {span}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setEditValue(shown.value !== null ? shown.value.toString() : '');
                  setEditing(side);
                }}
                className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                {override !== null ? 'Edit Override' : 'Set Override'}
              </button>
              {override !== null && (
                <button
                  onClick={() => { void saveOverride(side, null); }}
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
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">Monthly Income & Expenses</h3>
      <p className="text-gray-400 text-sm mb-6">
        What your Cash Flow forecast expects in a typical month, before planned events. It counts your regular income
        and bills and your typical spending, leaving out one-offs and anything you’ve left out of the forecast.{' '}
        <Link href="/cash-flow" className="text-blue-400 hover:text-blue-300">See what it counts</Link>.
        Set an override to use your own figure in the forecast and in Ask Linc instead.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {renderSide('income')}
        <div className="pt-4 border-t border-gray-700">
          {renderSide('expense')}
        </div>
      </div>
    </div>
  );
}
