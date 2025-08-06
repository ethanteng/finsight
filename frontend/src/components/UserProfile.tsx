"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { demoData } from '../data/demo-data';

interface UserProfileProps {
  userId?: string;
  isDemo?: boolean;
}

export default function UserProfile({ userId, isDemo }: UserProfileProps) {
  const [profileText, setProfileText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
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
        setProfileText(data.profile?.profileText || '');
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

  useEffect(() => {
    if (userId && !isDemo) {
      loadProfile();
    } else if (isDemo) {
      // Load demo profile with defensive programming
      console.log('Demo mode detected, demoData:', demoData);
      console.log('Demo data import check:', {
        hasDemoData: !!demoData,
        demoDataKeys: demoData ? Object.keys(demoData) : []
      });
      
      // Use fallback demo profile since the separate export isn't working
      const fallbackProfile = `I am Sarah Chen, a 35-year-old software engineer living in Austin, TX with my husband Michael (37, Marketing Manager) and our two children (ages 5 and 8). 

Our household income is $157,000 annually, with me earning $85,000 as a software engineer and Michael earning $72,000 as a marketing manager. We have a stable dual-income household with good job security in the tech industry.

We own our home with a $485,000 mortgage at 3.25% interest rate, and we're focused on building our emergency fund, saving for our children's education, and planning for retirement. Our financial goals include:
- Building a $50,000 emergency fund (currently at $28,450)
- Saving for a family vacation to Europe ($8,000 target, currently at $3,200)
- Building a house down payment fund ($100,000 target, currently at $45,000)
- Long-term retirement planning (currently have $246,200 in retirement accounts)

Our investment strategy is conservative with a mix of index funds in our 401(k) and Roth IRA. We prioritize saving and are working to increase our monthly savings rate. We're also focused on paying down our credit card debt and maintaining good credit scores.`;
      
      setProfileText(fallbackProfile);
    }
  }, [userId, isDemo, loadProfile]);

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

  // Don't show anything if not in demo mode and no userId
  if (!isDemo && !userId) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Your Financial Profile</h3>
        {!loading && !isDemo && (
          <button
            onClick={() => setEditing(!editing)}
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
              onClick={() => setEditing(false)}
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
    </div>
  );
} 