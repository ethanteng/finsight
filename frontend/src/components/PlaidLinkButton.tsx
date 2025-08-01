"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOnExit, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { useAnalytics } from './Analytics';

interface PlaidLinkButtonProps {
  onSuccess?: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit?: () => void;
  isDemo?: boolean;
}

export default function PlaidLinkButton({ onSuccess, onExit, isDemo = false }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const { trackEvent, trackConversion } = useAnalytics();

  // Fetch link_token from backend
  const createLinkToken = useCallback(async () => {
    setStatus('Requesting link token...');
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    try {
      const res = await fetch(`${API_URL}/plaid/create_link_token`, { method: 'POST' });
      const data = await res.json();
      if (data.link_token) {
        setLinkToken(data.link_token);
        setStatus('Opening Plaid Link...');
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
  const handleSuccess: PlaidLinkOnSuccess = useCallback(async (publicToken, metadata) => {
    try {
      // Track successful account linking
      trackEvent('plaid_account_linked', {
        institution_count: metadata.institution?.institution_id ? 1 : 0,
        account_count: metadata.accounts?.length || 0,
        is_demo: isDemo
      });
      
      // Track conversion
      trackConversion('account_connection', 1);
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${API_URL}/plaid/exchange_public_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          public_token: publicToken,
          metadata: metadata,
        }),
      });

      if (res.ok) {
        console.log('Successfully exchanged public token');
        // Call the onSuccess callback if provided
        if (onSuccess) {
          onSuccess(publicToken, metadata);
        }
      } else {
        console.error('Failed to exchange public token');
        // Track error
        trackEvent('plaid_exchange_error', {
          error: 'Failed to exchange public token',
          is_demo: isDemo
        });
      }
    } catch (error) {
      console.error('Error exchanging public token:', error);
      // Track error
      trackEvent('plaid_exchange_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        is_demo: isDemo
      });
    }
  }, [trackEvent, trackConversion, isDemo, onSuccess]);

  const handleExit: PlaidLinkOnExit = useCallback((err, metadata) => {
    console.log('Plaid Link exit:', err, metadata);
    
    // Track exit event
    trackEvent('plaid_link_exit', {
      error: err?.error_message || 'User exited',
      institution: metadata.institution?.name,
      is_demo: isDemo
    });
    
    // Call the onExit callback if provided
    if (onExit) {
      onExit();
    }
  }, [trackEvent, isDemo, onExit]);

  // Always call the hook, but only use it when linkToken is set
  const plaid = usePlaidLink(
    linkToken
      ? { token: linkToken, onSuccess: handleSuccess, onExit: handleExit }
      : { token: 'dummy-token', onSuccess: () => {}, onExit: () => {} }
  );

  // Automatically open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && plaid.ready) {
      plaid.open();
    }
  }, [linkToken, plaid.ready, plaid]);

  return (
    <div className="space-y-3">
      {isDemo ? (
        <div>
          <button 
            disabled
            className="bg-gray-600 cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Connect More Accounts
          </button>
          <div className="text-sm text-gray-400 mt-2">
            This is a demo. In the real app, you would see Plaid open to let you connect your bank account.
          </div>
        </div>
      ) : (
        <>
          <button 
            onClick={createLinkToken} 
            disabled={!!linkToken}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Connect More Accounts
          </button>
          {status && (
            <div className="text-sm text-gray-300 bg-gray-700 px-3 py-2 rounded">
              {status}
            </div>
          )}
        </>
      )}
    </div>
  );
} 