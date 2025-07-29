"use client";

import { useState, useEffect, useCallback } from 'react';

interface TierInfo {
  testTier: string;
  backendTier: string;
  message: string;
}

export default function TokenRefresh() {
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
        return 'text-green-500';
      case 'standard':
        return 'text-blue-500';
      case 'premium':
        return 'text-purple-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Tier Testing</h3>
          {tierInfo && (
            <div className="text-sm text-gray-300">
              <p>Current Test Tier: <span className={getTierColor(tierInfo.testTier)}>{tierInfo.testTier}</span></p>
              <p>Backend Tier: <span className={getTierColor(tierInfo.backendTier)}>{tierInfo.backendTier}</span></p>
              <p className="text-xs text-gray-400 mt-1">{tierInfo.message}</p>
            </div>
          )}
        </div>
        <button
          onClick={checkCurrentTier}
          disabled={loading}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>
      
      <div className="mt-3 text-xs text-gray-400">
        <p>To test different tiers, set <code className="bg-gray-700 px-1 rounded">TEST_USER_TIER</code> in your environment:</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li><code className="bg-gray-700 px-1 rounded">TEST_USER_TIER=starter</code> - Basic features only</li>
          <li><code className="bg-gray-700 px-1 rounded">TEST_USER_TIER=standard</code> - With market context</li>
          <li><code className="bg-gray-700 px-1 rounded">TEST_USER_TIER=premium</code> - Full market data & simulations</li>
        </ul>
      </div>
    </div>
  );
} 