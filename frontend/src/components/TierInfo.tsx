"use client";

import { useState, useEffect } from 'react';

interface DataSource {
  name: string;
  description: string;
  category: string;
}

interface UnavailableSource {
  name: string;
  description: string;
  category: string;
  upgradeBenefit: string;
  requiredTier: string;
}

interface TierInfo {
  currentTier: string;
  availableSources: DataSource[];
  unavailableSources: UnavailableSource[];
  upgradeSuggestions: string[];
  limitations: string[];
  nextTier: string | null;
}

interface TierInfoProps {
  className?: string;
  showUpgradeButton?: boolean;
}

export default function TierInfo({ className = "", showUpgradeButton = true }: TierInfoProps) {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    const fetchTierInfo = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('auth_token');
        if (!token) {
          setError('Authentication required');
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_URL}/tier-info`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setTierInfo(data);
        } else if (response.status === 401) {
          setError('Please log in to view tier information');
        } else {
          setError('Failed to load tier information');
        }
      } catch (err) {
        console.error('Error fetching tier info:', err);
        setError('Failed to load tier information');
      } finally {
        setLoading(false);
      }
    };

    fetchTierInfo();
  }, [API_URL]);

  const getTierColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'starter':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'standard':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'premium':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'account':
        return '🏦';
      case 'economic':
        return '📊';
      case 'external':
        return '📈';
      case 'market':
        return '💹';
      default:
        return '📋';
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="bg-gray-200 h-4 rounded mb-2"></div>
        <div className="bg-gray-200 h-3 rounded mb-1"></div>
        <div className="bg-gray-200 h-3 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-600 text-sm ${className}`}>
        {error}
      </div>
    );
  }

  if (!tierInfo) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Current Tier Badge */}
      <div className="flex items-center justify-between">
        <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getTierColor(tierInfo.currentTier)}`}>
          {getTierDisplayName(tierInfo.currentTier)} Plan
        </div>
        {showUpgradeButton && tierInfo.nextTier && (
          <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Upgrade to {getTierDisplayName(tierInfo.nextTier)}
          </button>
        )}
      </div>

      {/* Available Features */}
      {tierInfo.availableSources.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">Available Features</h3>
          <div className="space-y-2">
            {tierInfo.availableSources.map((source, index) => (
              <div key={index} className="flex items-start space-x-2">
                <span className="text-sm">{getCategoryIcon(source.category)}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{source.name}</div>
                  <div className="text-xs text-gray-600">{source.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limitations */}
      {tierInfo.limitations.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">Current Limitations</h3>
          <div className="space-y-1">
            {tierInfo.limitations.map((limitation, index) => (
              <div key={index} className="flex items-start space-x-2">
                <span className="text-red-500 text-xs mt-0.5">•</span>
                <span className="text-xs text-gray-600">{limitation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade Suggestions */}
      {tierInfo.unavailableSources.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">Upgrade to Access</h3>
          <div className="space-y-3">
            {tierInfo.unavailableSources.map((source, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <span className="text-sm">{getCategoryIcon(source.category)}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{source.name}</div>
                    <div className="text-xs text-gray-600 mb-1">{source.description}</div>
                    <div className="text-xs text-blue-600 font-medium">{source.upgradeBenefit}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade Suggestions */}
      {tierInfo.upgradeSuggestions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h3 className="text-sm font-medium text-blue-900 mb-2">💡 Upgrade Benefits</h3>
          <div className="space-y-1">
            {tierInfo.upgradeSuggestions.map((suggestion, index) => (
              <div key={index} className="text-xs text-blue-800">
                {suggestion}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 