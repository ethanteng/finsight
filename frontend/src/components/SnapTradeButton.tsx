"use client";

import React, { useState, useEffect } from 'react';

interface SnapTradeStatus {
  status: string;
  snapTradeUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function SnapTradeButton() {
  const [status, setStatus] = useState<string>('loading');
  const [snapTradeStatus, setSnapTradeStatus] = useState<SnapTradeStatus | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    checkSnapTradeStatus();
  }, []);

  const checkSnapTradeStatus = async () => {
    try {
      setStatus('loading');
      
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/status/user`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSnapTradeStatus(data);
        setStatus(data.status);
      } else if (response.status === 404) {
        setStatus('not_initialized');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Error checking SnapTrade status:', error);
      setStatus('error');
    }
  };

  const initializeSnapTrade = async () => {
    try {
      setIsInitializing(true);
      
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('SnapTrade initialized:', data);
        await checkSnapTradeStatus(); // Refresh status
      } else {
        const errorData = await response.json();
        console.error('SnapTrade initialization failed:', errorData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Error initializing SnapTrade:', error);
      setStatus('error');
    } finally {
      setIsInitializing(false);
    }
  };

  const getButtonText = () => {
    switch (status) {
      case 'loading':
        return 'Loading...';
      case 'not_authenticated':
        return 'Please log in';
      case 'not_initialized':
        return isInitializing ? 'Initializing...' : 'Connect SnapTrade';
      case 'registered':
        return 'SnapTrade Connected';
      case 'connected':
        return 'SnapTrade Active';
      case 'disconnected':
        return 'Reconnect SnapTrade';
      case 'error':
        return 'Error - Try Again';
      default:
        return 'Connect SnapTrade';
    }
  };

  const getButtonColor = () => {
    switch (status) {
      case 'registered':
      case 'connected':
        return 'bg-green-500 hover:bg-green-600';
      case 'error':
        return 'bg-red-500 hover:bg-red-600';
      case 'loading':
        return 'bg-gray-400 cursor-not-allowed';
      default:
        return 'bg-blue-500 hover:bg-blue-600';
    }
  };

  const isButtonDisabled = () => {
    return status === 'loading' || isInitializing || status === 'not_authenticated';
  };

  const handleClick = () => {
    if (status === 'not_initialized' || status === 'error') {
      initializeSnapTrade();
    } else if (status === 'disconnected') {
      initializeSnapTrade();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <button
          onClick={handleClick}
          disabled={isButtonDisabled()}
          className={`px-4 py-2 text-white font-medium rounded-lg transition-colors ${getButtonColor()} ${
            isButtonDisabled() ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          {getButtonText()}
        </button>
        
        {status === 'loading' && (
          <div className="text-sm text-gray-600">Checking status...</div>
        )}
      </div>

      {snapTradeStatus && (
        <div className="text-sm text-gray-600">
          <div>Status: {snapTradeStatus.status}</div>
          {snapTradeStatus.snapTradeUserId && (
            <div>User ID: {snapTradeStatus.snapTradeUserId}</div>
          )}
          {snapTradeStatus.createdAt && (
            <div>Created: {new Date(snapTradeStatus.createdAt).toLocaleDateString()}</div>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-600">
          There was an error connecting to SnapTrade. Please try again.
        </div>
      )}
    </div>
  );
}
