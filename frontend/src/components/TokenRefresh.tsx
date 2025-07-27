"use client";
import { useState, useEffect } from 'react';

interface TokenRefreshProps {
  accessToken: string;
  onRefresh?: (newToken: string) => void;
  onError?: (error: string) => void;
}

export default function TokenRefresh({ accessToken, onRefresh, onError }: TokenRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const refreshToken = async () => {
    if (!accessToken) return;

    setIsRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/plaid/refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setLastRefresh(new Date());
        onRefresh?.(data.access_token);
      } else {
        // Token is invalid, needs reconnection
        onError?.('Your account connection has expired. Please reconnect your account.');
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      onError?.('Failed to refresh account connection. Please reconnect your account.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh token every 25 minutes (before the 30-minute expiration)
  useEffect(() => {
    if (!accessToken) return;

    const interval = setInterval(() => {
      refreshToken();
    }, 25 * 60 * 1000); // 25 minutes

    return () => clearInterval(interval);
  }, [accessToken]);

  return (
    <div className="text-xs text-gray-400">
      {lastRefresh && (
        <span>Last refreshed: {lastRefresh.toLocaleTimeString()}</span>
      )}
      {isRefreshing && (
        <span className="ml-2">Refreshing...</span>
      )}
    </div>
  );
} 