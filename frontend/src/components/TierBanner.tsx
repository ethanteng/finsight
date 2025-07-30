"use client";

import { useState, useEffect, useCallback } from 'react';

interface TierInfo {
  tier: string;
  message: string;
}

export default function TierBanner() {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const checkCurrentTier = useCallback(async () => {
    setLoading(true);
    try {
      // Get the user's actual tier from the backend
      const response = await fetch(`${API_URL}/user/tier`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTierInfo(data);
      } else if (response.status === 401) {
        // User not authenticated, don't show tier banner
        setTierInfo(null);
      }
    } catch (error) {
      console.error('Error checking tier:', error);
      setTierInfo(null);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    checkCurrentTier();
  }, [checkCurrentTier]);

  const getTierColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'starter':
        return 'bg-green-500 text-green-900';
      case 'standard':
        return 'bg-blue-500 text-blue-900';
      case 'premium':
        return 'bg-purple-500 text-purple-900';
      default:
        return 'bg-gray-500 text-gray-900';
    }
  };

  const getTierDisplayName = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'starter':
        return 'Starter';
      case 'standard':
        return 'Standard';
      case 'premium':
        return 'Premium';
      default:
        return tier;
    }
  };

  if (!tierInfo) {
    return null;
  }

  return (
    <div className={`px-3 py-1 rounded-full text-xs font-medium ${getTierColor(tierInfo.tier)}`}>
      {loading ? 'Loading...' : `${getTierDisplayName(tierInfo.tier)} Plan`}
    </div>
  );
} 