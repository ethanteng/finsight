"use client";

import React, { useCallback, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

interface PlaidLinkButtonProps {
  onAccountLinked?: () => void;
}

export default function PlaidLinkButton({ onAccountLinked }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  // Fetch link_token from backend
  const createLinkToken = useCallback(async () => {
    setStatus('Requesting link token...');
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    try {
      const res = await fetch(`${API_URL}/plaid/create_link_token`, { method: 'POST' });
      const data = await res.json();
      if (data.link_token) {
        setLinkToken(data.link_token);
        setStatus('Ready to link your account.');
      } else if (data.error) {
        setStatus(`${data.error}: ${data.details || 'Failed to create link token'}`);
      } else {
        setStatus('Failed to create link token.');
      }
    } catch {
      setStatus('Network error. Please try again.');
    }
  }, []);

  // Exchange public_token for access_token
  const onSuccess = useCallback(async (public_token: string) => {
    setStatus('Exchanging public token...');
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Add authentication header
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('Sending auth token for Plaid exchange:', token.substring(0, 20) + '...');
      } else {
        console.log('No auth token found for Plaid exchange');
      }
      
      const res = await fetch(`${API_URL}/plaid/exchange_public_token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ public_token }),
      });
      const data = await res.json();
      if (data.access_token) {
        setStatus('Account linked!');
        // Access token is now stored in the database, no need for localStorage
        // Clear link token so user can link more accounts
        setLinkToken(null);
        // Notify parent component that account was linked
        onAccountLinked?.();
      } else if (data.error) {
        setStatus(`${data.error}: ${data.details || 'Failed to link account'}`);
      } else {
        setStatus('Failed to link account.');
      }
    } catch {
      setStatus('Network error. Please try again.');
    }
  }, [onAccountLinked]);

  // Always call the hook, but only use it when linkToken is set
  const plaid = usePlaidLink(
    linkToken
      ? { token: linkToken, onSuccess }
      : { token: 'dummy-token', onSuccess: () => {} }
  );

  return (
    <div className="space-y-3">
      <div className="flex space-x-3">
        <button 
          onClick={createLinkToken} 
          disabled={!!linkToken}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
        >
          Connect More Accounts
        </button>
        {linkToken && (
          <button 
            onClick={() => plaid.open()} 
            disabled={!plaid.ready}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Open Plaid Link
          </button>
        )}
      </div>
      {status && (
        <div className="text-sm text-gray-300 bg-gray-700 px-3 py-2 rounded">
          {status}
        </div>
      )}
    </div>
  );
} 