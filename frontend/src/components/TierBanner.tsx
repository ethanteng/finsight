"use client";

import { useState, useEffect, useCallback } from 'react';

interface TierInfo {
  testTier: string;
  backendTier: string;
  message: string;
}

export default function TierBanner() {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const checkCurrentTier = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/test/current-tier`);
      if (response.ok) {
        const data = await response.json();
        setTierInfo(data);
      }
    } catch (error) {
      console.error('Error checking tier:', error);
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
    <div className={`px-3 py-1 rounded-full text-xs font-medium ${getTierColor(tierInfo.backendTier)}`}>
      {loading ? 'Loading...' : `${getTierDisplayName(tierInfo.backendTier)} Plan`}
    </div>
  );
} 