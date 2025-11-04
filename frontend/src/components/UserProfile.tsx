"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface UserProfileProps {
  userId?: string;
  isDemo?: boolean;
}

interface HomeData {
  address: string;
  value: number;
  valueLow: number;
  valueHigh: number;
  lastUpdated: string;
}

export default function UserProfile({ userId, isDemo }: UserProfileProps) {
  const [profileText, setProfileText] = useState<string>('');
  const [originalProfileText, setOriginalProfileText] = useState<string>('');
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
  
  const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
        const profileTextValue = data.profile?.profileText || '';
        setProfileText(profileTextValue);
        setOriginalProfileText(profileTextValue);
      } else {
        console.error('Failed to load profile:', response.status);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      setError('Failed to load profile');
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
    if (userId && !isDemo) {
      loadProfile();
      loadHomeData();
    }
  }, [userId, isDemo, loadProfile, loadHomeData]);

  const saveProfile = async (newText: string) => {
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

      const response = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ profileText: newText })
      });
      
      if (response.ok) {
        setProfileText(newText);
        setOriginalProfileText(newText);
        setEditing(false);
      } else {
        setError('Failed to save profile');
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      setError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setEditing(true);
  };

  const handleCancel = () => {
    setProfileText(originalProfileText);
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

  // Don't show anything if not in demo mode and no userId
  if (!isDemo && !userId) {
    return null;
  }

  // For demo mode, show the profile immediately using the same data structure as the backend
  if (isDemo) {
    const demoProfileText = `I am Sarah Chen, a 35-year-old software engineer living in Austin, TX with my husband Michael (37, Marketing Manager) and our two children (ages 5 and 8). 

Our household income is $157,000 annually, with me earning $85,000 as a software engineer and Michael earning $72,000 as a marketing manager. We have a stable dual-income household with good job security in the tech industry.

We own our home with a $485,000 mortgage at 3.25% interest rate, and we're focused on building our emergency fund, saving for our children's education, and planning for retirement. Our financial goals include:
- Building a $50,000 emergency fund (currently at $28,450)
- Saving for a family vacation to Europe ($8,000 target, currently at $3,200)
- Building a house down payment fund ($100,000 target, currently at $45,000)
- Long-term retirement planning (currently have $246,200 in retirement accounts)

Our investment strategy is conservative with a mix of index funds in our 401(k) and Roth IRA. We prioritize saving and are working to increase our monthly savings rate. We're also focused on paying down our credit card debt and maintaining good credit scores.

Note: This profile reflects our financial situation as of August 2025.`;
    
    return (
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Your Financial Profile</h3>
          <span className="text-gray-400 text-sm">Demo Mode - Read Only</span>
        </div>
        <div>
          <p className="text-gray-300 whitespace-pre-wrap">{demoProfileText}</p>
          <div className="mt-4 text-xs text-gray-500">
            This is a demo profile showing how your financial profile would look in production.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Your Financial Profile</h3>
        {!loading && !isDemo && (
          <button
            onClick={editing ? handleCancel : handleEdit}
            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
        {isDemo && (
          <span className="text-gray-400 text-sm">Demo Mode - Read Only</span>
        )}
      </div>
      
      {loading ? (
        <div className="text-gray-400">Loading profile...</div>
      ) : editing ? (
        <div>
          <textarea
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            className="w-full h-32 p-3 border border-gray-600 rounded-lg bg-gray-700 text-white placeholder-gray-400 resize-none"
            placeholder="Your profile will be built automatically as you chat with Linc..."
          />
          {error && (
            <div className="text-red-400 text-sm mt-2">{error}</div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => saveProfile(profileText)}
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
          {profileText ? (
            <>
              <p className="text-gray-300 whitespace-pre-wrap">{profileText}</p>
              <div className="mt-4 text-xs text-gray-500">
                {isDemo 
                  ? "This is a demo profile showing how your financial profile would look in production."
                  : "This profile is built automatically from your conversations with Linc and your financial data."
                }
              </div>
            </>
          ) : (
            <div className="text-gray-400">
              <p>Your financial profile will be built automatically as you chat with Linc.</p>
              <p className="text-sm mt-2">Start asking questions to build your profile!</p>
            </div>
          )}
        </div>
      )}

      {/* Home Information Section - Only for non-demo users */}
      {!isDemo && (
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
                    <span className="text-gray-400 text-sm">Estimated Value:</span>
                    <div className="text-white font-medium text-lg">
                      {formatCurrency(homeData.valueLow)} - {formatCurrency(homeData.valueHigh)}
                    </div>
                    <div className="text-gray-500 text-xs">
                      (Mid-range estimate: {formatCurrency(homeData.value)})
                    </div>
                  </div>
                  <div className="text-gray-500 text-xs">
                    Last updated: {formatDate(homeData.lastUpdated)}
                  </div>
                </div>
                
                <div className="flex gap-2">
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
            {homeError && (
              <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-300 text-sm">
                {homeError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
} 