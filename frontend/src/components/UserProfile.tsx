"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface UserProfileProps {
  userId?: string;
}

interface HomeData {
  address: string;
  value: number;
  valueLow: number;
  valueHigh: number;
  lastUpdated: string;
  isManualOverride?: boolean;
}

interface PersonalMemory {
  preferredName?: string;
  age?: number;
  city?: string;
  stateOrProvince?: string;
  country?: string;
  householdStatus?: string;
  dependentCount?: number;
  dependentAges?: number[];
  occupation?: string;
  industry?: string;
  employmentStatus?: string;
  retirementStatus?: string;
}

const EMPTY_MEMORY: PersonalMemory = {};

export default function UserProfile({ userId }: UserProfileProps) {
  const [memory, setMemory] = useState<PersonalMemory>(EMPTY_MEMORY);
  const [originalMemory, setOriginalMemory] = useState<PersonalMemory>(EMPTY_MEMORY);
  const [dependentAgesText, setDependentAgesText] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Home data state
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [homeAddress, setHomeAddress] = useState('');
  const [ownsHome, setOwnsHome] = useState(false);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeSaving, setHomeSaving] = useState(false);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [homeEditing, setHomeEditing] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [homeSuccess, setHomeSuccess] = useState('');

  // Home value override state
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSavingValue, setIsSavingValue] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/profile`, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        const loadedMemory = data.memory || EMPTY_MEMORY;
        setMemory(loadedMemory);
        setOriginalMemory(loadedMemory);
        setDependentAgesText((loadedMemory.dependentAges || []).join(', '));
      } else {
        console.error('Failed to load remembered details:', response.status);
      }
    } catch (error) {
      console.error('Failed to load remembered details:', error);
      setError('Failed to load remembered details');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const loadHomeData = useCallback(async () => {
    console.log('🏠 Frontend: loadHomeData called');
    setHomeLoading(true);
    setHomeError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      console.log('🏠 Frontend: Fetching from', `${API_URL}/profile/home`);
      const response = await fetch(`${API_URL}/profile/home`, {
        headers,
      });

      console.log('🏠 Frontend: Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('🏠 Frontend: Response data:', data);

        if (data.hasHome && data.homeData) {
          console.log('🏠 Frontend: Setting home data:', data.homeData);
          setHomeData(data.homeData);
          setHomeAddress(data.homeData.address);
          setOwnsHome(true);
        } else {
          console.log('🏠 Frontend: No home data available');
        }
      } else {
        console.error('🏠 Frontend: Failed to load home data:', response.status);
      }
    } catch (error) {
      console.error('🏠 Frontend: Error loading home data:', error);
      // Don't set error - home data is optional
    } finally {
      setHomeLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    if (userId) {
      loadProfile();
      loadHomeData();
    }
  }, [userId, loadProfile, loadHomeData]);

  const saveMemory = async () => {
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const dependentAges = dependentAgesText
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(Number);
      if (dependentAges.some(age => !Number.isInteger(age) || age < 0 || age > 100)) {
        setError('Dependent ages must be whole numbers between 0 and 100.');
        setSaving(false);
        return;
      }
      const memoryToSave: PersonalMemory = {
        ...memory,
        dependentAges: dependentAges.length ? dependentAges : undefined,
      };

      const response = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ memory: memoryToSave })
      });

      if (response.ok) {
        const data = await response.json();
        const savedMemory = data.memory || memoryToSave;
        setMemory(savedMemory);
        setOriginalMemory(savedMemory);
        setDependentAgesText((savedMemory.dependentAges || []).join(', '));
        setEditing(false);
      } else {
        let message = 'Failed to save remembered details';
        try {
          const errorData = await response.json();
          if (typeof errorData?.error === 'string' && errorData.error) {
            message = errorData.error;
          }
        } catch {
          // Keep the generic message when the body is not JSON.
        }
        setError(message);
      }
    } catch (error) {
      console.error('Failed to save remembered details:', error);
      setError('Failed to save remembered details');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setDependentAgesText((memory.dependentAges || []).join(', '));
    setEditing(true);
  };

  const handleCancel = () => {
    setMemory(originalMemory);
    setDependentAgesText((originalMemory.dependentAges || []).join(', '));
    setEditing(false);
  };

  const handleEditHome = () => {
    if (homeData) {
      setHomeAddress(homeData.address);
      setOwnsHome(true);
      setHomeEditing(true);
    }
  };

  const handleCancelEditHome = () => {
    if (homeData) {
      setHomeAddress(homeData.address);
      setOwnsHome(true);
    }
    setHomeEditing(false);
  };

  const saveHomeData = async () => {
    setHomeSaving(true);
    setHomeError('');
    setHomeSuccess('');

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/profile/home`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          address: homeAddress.trim(),
          ownsHome
        })
      });

      if (response.ok) {
        const data = await response.json();
        setHomeData(data.homeData);
        setHomeEditing(false);
        setHomeSuccess('Home value updated successfully!');
        setTimeout(() => setHomeSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setHomeError(errorData.error || 'Failed to save home data');
      }
    } catch (error) {
      console.error('Failed to save home data:', error);
      setHomeError('Failed to save home data');
    } finally {
      setHomeSaving(false);
    }
  };

  const refreshHomeValue = async () => {
    setHomeRefreshing(true);
    setHomeError('');
    setHomeSuccess('');

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/profile/home/refresh`, {
        method: 'POST',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setHomeData(data.homeData);
        setHomeAddress(data.homeData.address);
        setOwnsHome(true);
        setHomeSuccess('Home value refreshed successfully!');
        setTimeout(() => setHomeSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setHomeError(errorData.error || 'Failed to refresh home value');
      }
    } catch (error) {
      console.error('Failed to refresh home value:', error);
      setHomeError('Failed to refresh home value');
    } finally {
      setHomeRefreshing(false);
    }
  };

  const handleSaveValue = async () => {
    const numericValue = parseFloat(editValue.replace(/[^0-9.]/g, ''));

    if (isNaN(numericValue) || numericValue <= 0) {
      setValueError('Please enter a valid positive number');
      return;
    }

    setIsSavingValue(true);
    setValueError(null);

    try {
      const token = localStorage.getItem('auth_token');

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

      const data = await response.json();
      setHomeData(data.homeData);
      setIsEditingValue(false);
      setHomeSuccess('Home value updated successfully!');
      setTimeout(() => setHomeSuccess(''), 3000);
    } catch (err) {
      setValueError(err instanceof Error ? err.message : 'Failed to update home value');
    } finally {
      setIsSavingValue(false);
    }
  };

  const handleResetValue = async () => {
    setIsSavingValue(true);
    setValueError(null);
    setHomeSuccess('');

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Please log in to update your home value');
      }

      const response = await fetch(`${API_URL}/profile/home/value`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      let data: { homeData?: HomeData; error?: string };
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset home value');
      }

      if (!data.homeData) {
        throw new Error('Invalid response from server');
      }

      setHomeData(data.homeData);
      setIsEditingValue(false);
      setHomeSuccess('Home value reset to estimate!');
      setTimeout(() => setHomeSuccess(''), 3000);
    } catch (err) {
      setValueError(err instanceof Error ? err.message : 'Failed to reset home value');
    } finally {
      setIsSavingValue(false);
    }
  };

  const handleCancelValueEdit = () => {
    if (homeData) {
      setEditValue(homeData.value.toString());
    }
    setIsEditingValue(false);
    setValueError(null);
  };

  // Sync editValue with homeData.value when it changes
  useEffect(() => {
    if (!isEditingValue && homeData) {
      setEditValue(homeData.value.toString());
    }
  }, [homeData?.value, isEditingValue]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const updateMemory = (field: keyof PersonalMemory, value: string | number | undefined) => {
    setMemory(current => ({ ...current, [field]: value === '' ? undefined : value }));
  };

  const rememberedItems = [
    ['Preferred name', memory.preferredName],
    ['Age', memory.age],
    ['Location', [memory.city, memory.stateOrProvince, memory.country].filter(Boolean).join(', ')],
    ['Household', memory.householdStatus],
    ['Dependents', memory.dependentCount],
    ['Dependent ages', memory.dependentAges?.join(', ')],
    ['Occupation', memory.occupation],
    ['Industry', memory.industry],
    ['Employment', memory.employmentStatus],
    ['Retirement status', memory.retirementStatus],
  ].filter(([, value]) => value !== undefined && value !== '');

  if (!userId) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">What Linc remembers about you</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Only biographical details you tell Linc directly. Your balances, spending, accounts, goals, and assumptions live elsewhere and are never added here.
          </p>
        </div>
        {!loading && (
          <button
            onClick={editing ? handleCancel : handleEdit}
            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading remembered details...</div>
      ) : editing ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-gray-300">Preferred name
              <input value={memory.preferredName || ''} onChange={event => updateMemory('preferredName', event.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">Age
              <input type="number" min="0" max="120" value={memory.age ?? ''} onChange={event => updateMemory('age', event.target.value === '' ? undefined : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">City
              <input value={memory.city || ''} onChange={event => updateMemory('city', event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">State or province
              <input value={memory.stateOrProvince || ''} onChange={event => updateMemory('stateOrProvince', event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">Country
              <input value={memory.country || ''} onChange={event => updateMemory('country', event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">Household status
              <select value={memory.householdStatus || ''} onChange={event => updateMemory('householdStatus', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white">
                <option value="">Not remembered</option><option value="single">Single</option><option value="partnered">Partnered</option><option value="married">Married</option><option value="separated">Separated</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option>
              </select>
            </label>
            <label className="text-sm text-gray-300">Number of dependents
              <input type="number" min="0" max="20" value={memory.dependentCount ?? ''} onChange={event => updateMemory('dependentCount', event.target.value === '' ? undefined : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">Dependent ages <span className="text-gray-500">(comma-separated)</span>
              <input value={dependentAgesText} onChange={event => setDependentAgesText(event.target.value)} placeholder="8, 11" className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">Occupation
              <input value={memory.occupation || ''} onChange={event => updateMemory('occupation', event.target.value)} maxLength={140} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">Industry
              <input value={memory.industry || ''} onChange={event => updateMemory('industry', event.target.value)} maxLength={140} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-gray-300">Employment status
              <select value={memory.employmentStatus || ''} onChange={event => updateMemory('employmentStatus', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white">
                <option value="">Not remembered</option><option value="employed">Employed</option><option value="self-employed">Self-employed</option><option value="unemployed">Unemployed</option><option value="student">Student</option><option value="homemaker">Homemaker</option><option value="retired">Retired</option><option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm text-gray-300">Retirement status
              <select value={memory.retirementStatus || ''} onChange={event => updateMemory('retirementStatus', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white">
                <option value="">Not remembered</option><option value="not-retired">Not retired</option><option value="partially-retired">Partially retired</option><option value="retired">Retired</option>
              </select>
            </label>
          </div>
          {error && (
            <div className="text-red-400 text-sm mt-2">{error}</div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={saveMemory}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-800 transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-600 text-gray-300 rounded hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {rememberedItems.length > 0 ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {rememberedItems.map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-gray-700 px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="mt-1 text-white">{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="text-gray-400">
              <p>Linc is not remembering any personal details yet.</p>
              <p className="text-sm mt-2">You can add them here, or mention them naturally in a conversation.</p>
            </div>
          )}
        </div>
      )}

      {/* Home Information Section */}
      <>
          <div className="mt-6 pt-6 border-t border-gray-700">
            <h4 className="text-md font-semibold text-white mb-4">Home Information</h4>

            {homeLoading ? (
              <div className="text-gray-400">Loading home data...</div>
            ) : homeData && !homeEditing ? (
              <div>
                <div className="bg-gray-700 rounded-lg p-4 mb-4">
                  <div className="mb-2">
                    <span className="text-gray-400 text-sm">Address:</span>
                    <div className="text-white">{homeData.address}</div>
                  </div>
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-400 text-sm">Home Value:</span>
                      {homeData.isManualOverride && (
                        <span className="px-2 py-1 bg-blue-900/30 text-blue-300 text-xs rounded border border-blue-700/50">
                          Manual
                        </span>
                      )}
                    </div>
                    {isEditingValue ? (
                      <div className="space-y-3">
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
                            setValueError(null);
                          }}
                          className="w-full bg-gray-800 text-white text-2xl font-bold px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                          placeholder="Enter value"
                          disabled={isSavingValue}
                          autoFocus
                        />
                        {valueError && (
                          <div className="text-red-400 text-sm">{valueError}</div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveValue}
                            disabled={isSavingValue}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSavingValue ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelValueEdit}
                            disabled={isSavingValue}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-white font-bold text-2xl mb-1">
                          {formatCurrency(homeData.value)}
                        </div>
                        {!homeData.isManualOverride && (
                          <>
                            <div className="text-gray-400 text-sm mb-1">
                              Range: {formatCurrency(homeData.valueLow)} - {formatCurrency(homeData.valueHigh)}
                            </div>
                            <div className="text-gray-500 text-xs">
                              (Mid-range estimate)
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs mt-2">
                    Last updated: {formatDate(homeData.lastUpdated)}
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {!isEditingValue && (
                    <button
                      onClick={() => setIsEditingValue(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                    >
                      Edit Value
                    </button>
                  )}
                  {homeData.isManualOverride && !isEditingValue && (
                    <button
                      onClick={handleResetValue}
                      disabled={isSavingValue}
                      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-800 transition-colors text-sm"
                    >
                      Reset to Estimate
                    </button>
                  )}
                  <button
                    onClick={handleEditHome}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
                  >
                    Edit Address
                  </button>
                  <button
                    onClick={refreshHomeValue}
                    disabled={homeRefreshing}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-800 transition-colors text-sm"
                  >
                    {homeRefreshing ? 'Refreshing...' : 'Refresh Home Value'}
                  </button>
                </div>
              </div>
            ) : homeEditing ? (
              <div>
                <p className="text-gray-400 text-sm mb-4">
                  Update your home address to refresh the home value.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      Home Address
                    </label>
                    <input
                      type="text"
                      value={homeAddress}
                      onChange={(e) => setHomeAddress(e.target.value)}
                      placeholder="123 Main St, City, State, Zip"
                      className="w-full p-3 border border-gray-600 rounded-lg bg-gray-700 text-white placeholder-gray-400"
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="ownsHomeEdit"
                      checked={ownsHome}
                      onChange={(e) => setOwnsHome(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="ownsHomeEdit" className="ml-2 text-gray-300 text-sm">
                      I own this home
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={saveHomeData}
                      disabled={homeSaving || !homeAddress.trim() || !ownsHome}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-800 transition-colors text-sm"
                    >
                      {homeSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={handleCancelEditHome}
                      disabled={homeSaving}
                      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-800 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-gray-400 text-sm mb-4">
                  Add your home address to track your home value and include it in your Net Worth calculation.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      Home Address
                    </label>
                    <input
                      type="text"
                      value={homeAddress}
                      onChange={(e) => setHomeAddress(e.target.value)}
                      placeholder="123 Main St, City, State, Zip"
                      className="w-full p-3 border border-gray-600 rounded-lg bg-gray-700 text-white placeholder-gray-400"
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="ownsHome"
                      checked={ownsHome}
                      onChange={(e) => setOwnsHome(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="ownsHome" className="ml-2 text-gray-300 text-sm">
                      I own this home
                    </label>
                  </div>

                  <button
                    onClick={saveHomeData}
                    disabled={homeSaving || !homeAddress.trim() || !ownsHome}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-800 transition-colors text-sm"
                  >
                    {homeSaving ? 'Adding...' : 'Add Home Value'}
                  </button>
                </div>
              </div>
            )}

            {/* Success/Error Messages */}
            {homeSuccess && (
              <div className="mt-3 p-3 bg-green-900/20 border border-green-700 rounded-lg text-green-300 text-sm">
                {homeSuccess}
              </div>
            )}
            {(homeError || valueError) && (
              <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-300 text-sm">
                {homeError || valueError}
              </div>
            )}
          </div>
      </>
    </div>
  );
}
