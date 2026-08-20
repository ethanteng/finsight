"use client";

import { useState, useEffect } from 'react';
import ManualIndicator from '../ui/ManualIndicator';

interface HomeData {
  address: string;
  value: number;
  valueLow: number | null;
  valueHigh: number | null;
  lastUpdated: string;
  isManualOverride?: boolean;
}

interface HomeValueCardProps {
  homeData: HomeData;
  onValueUpdate?: (updatedData: HomeData) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
}

interface HomeValueMutationResponse {
  homeData: HomeData;
}

export default function HomeValueCard({ 
  homeData, 
  onValueUpdate,
  isExpanded = false,
  onToggle
}: HomeValueCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(homeData.value.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync editValue with homeData.value when it changes (e.g., after save)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(homeData.value.toString());
    }
  }, [homeData.value, isEditing]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleSave = async () => {
    const numericValue = parseFloat(editValue.replace(/[^0-9.]/g, ''));
    
    if (isNaN(numericValue) || numericValue <= 0) {
      setError('Please enter a valid positive number');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      
      const response = await fetch(`${API_URL}/profile/home/value`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ value: numericValue })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update home value');
      }

      const data = await response.json() as HomeValueMutationResponse;

      // The value is saved; the canonical snapshot that feeds the totals is rebuilt in the
      // background. The owner decides how to present the gap.
      if (onValueUpdate) {
        onValueUpdate(data.homeData);
      }

      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update home value');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      
      const response = await fetch(`${API_URL}/profile/home/value`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reset home value');
      }

      const data = await response.json() as HomeValueMutationResponse;

      if (onValueUpdate) {
        onValueUpdate(data.homeData);
      }

      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset home value');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(homeData.value.toString());
    setIsEditing(false);
    setError(null);
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
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">Home Value</h3>
              {homeData.isManualOverride && (
                <ManualIndicator />
              )}
            </div>
            <div className="text-sm text-gray-400">
              {homeData.address || 'No address set'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-semibold text-xl">
            {formatCurrency(homeData.value)}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-700 p-6 space-y-4">
          {error && (
            <div role="alert" className="rounded border border-red-700/50 bg-red-900/30 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {homeData.address && (
            <div className="text-gray-400 text-sm">
              {homeData.address}
            </div>
          )}

          <div>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => {
                      // Allow only numbers and a single decimal point
                      let value = e.target.value.replace(/[^0-9.]/g, '');
                      
                      // Prevent multiple decimal points - keep only the first decimal part
                      const parts = value.split('.');
                      if (parts.length > 2) {
                        // Keep only the first part and the second part (first decimal part)
                        value = parts[0] + '.' + parts[1];
                      }
                      
                      setEditValue(value);
                      setError(null);
                    }}
                    className="w-full bg-gray-700 text-white text-3xl font-bold px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Enter value"
                    disabled={isSaving}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
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
              <>
                <div className="text-white font-bold text-3xl mb-2">
                  {formatCurrency(homeData.value)}
                </div>
                <div className="text-gray-400 text-sm mb-4">
                  {homeData.isManualOverride
                    ? 'Manual point value (no estimate range)'
                    : homeData.valueLow !== null && homeData.valueHigh !== null
                      ? `Estimated range: ${formatCurrency(homeData.valueLow)} - ${formatCurrency(homeData.valueHigh)}`
                      : 'Estimate range unavailable'}
                </div>
                <div className="text-gray-400 text-xs mb-4">
                  Updated {formatDate(homeData.lastUpdated)}
                </div>
              </>
            )}
          </div>

          <div className="pt-4 border-t border-gray-700 flex items-center justify-between">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                Edit Value →
              </button>
            )}
            {homeData.isManualOverride && !isEditing && (
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="text-gray-400 hover:text-gray-300 text-sm transition-colors disabled:opacity-50"
              >
                Reset to Estimate
              </button>
            )}
            {!homeData.isManualOverride && !isEditing && (
              <a
                href="/profile"
                className="text-gray-400 hover:text-gray-300 text-sm transition-colors"
              >
                Update Home Value →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
