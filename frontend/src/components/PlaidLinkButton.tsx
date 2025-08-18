"use client";

import React, { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOnExit, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { useAnalytics } from './Analytics';

// Global flag to prevent multiple Plaid Link initializations
let plaidLinkInitialized = false;

interface PlaidLinkButtonProps {
  onSuccess?: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit?: () => void;
  isDemo?: boolean;
}

export interface PlaidLinkButtonRef {
  createLinkToken: () => void;
}

const PlaidLinkButton = forwardRef<PlaidLinkButtonRef, PlaidLinkButtonProps>(({ onSuccess, onExit, isDemo = false }, ref) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const { trackEvent, trackConversion } = useAnalytics();

  // Prevent multiple Plaid Link initializations
  useEffect(() => {
    if (plaidLinkInitialized) {
      console.log('Plaid Link already initialized globally, skipping this instance');
      return;
    }
    
    console.log('Setting global Plaid Link initialization flag');
    plaidLinkInitialized = true;
    
    // Don't reset the flag on unmount - keep it initialized for the session
    // This prevents the "waiting" issue when manually connecting accounts
  }, []);

  // Fetch link_token from backend
  const createLinkToken = useCallback(async () => {
    setStatus('Connecting to your account...');
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Add demo mode header if this is a demo request
    if (isDemo) {
      headers['x-demo-mode'] = 'true';
    }
    
    try {
      console.log('Creating Plaid Link token...', { API_URL, isDemo, hasToken: !!token });
      
      const res = await fetch(`${API_URL}/plaid/create_link_token`, { 
        method: 'POST',
        headers,
        body: JSON.stringify({ isDemo })
      });
      
      console.log('Plaid Link token response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Plaid Link token creation failed:', res.status, errorText);
        setStatus(`Failed to create link token: ${res.status} ${errorText}`);
        return;
      }
      
      const data = await res.json();
      console.log('Plaid Link token response data:', data);
      
      if (data.link_token) {
        setLinkToken(data.link_token);
        setStatus('Connecting to your account...');
        console.log('Plaid Link token created successfully:', data.link_token.substring(0, 20) + '...');
      } else if (data.error) {
        console.error('Plaid Link token creation error:', data.error, data.details);
        setStatus(`${data.error}: ${data.details || 'Failed to create link token'}`);
      } else {
        console.error('Plaid Link token creation failed - no link_token or error in response');
        setStatus('Failed to create link token.');
      }
    } catch (error) {
      console.error('Plaid Link token creation network error:', error);
      setStatus('Network error. Please try again.');
    }
  }, [isDemo]);

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
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const res = await fetch(`${API_URL}/plaid/exchange_public_token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          public_token: publicToken,
          metadata: metadata,
        }),
      });

      if (res.ok) {
        console.log('Successfully exchanged public token');
        // Reset the component state after successful connection
        setLinkToken(null);
        setStatus('');
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
        // Reset state on error too
        setLinkToken(null);
        setStatus('');
      }
    } catch (error) {
      console.error('Error exchanging public token:', error);
      // Track error
      trackEvent('plaid_exchange_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        is_demo: isDemo
      });
      // Reset state on error
      setLinkToken(null);
      setStatus('');
    }
  }, [trackEvent, trackConversion, isDemo, onSuccess]);

  const handleExit: PlaidLinkOnExit = useCallback((err, metadata) => {
    console.log('Plaid Link exit:', err, metadata);
    
    // Reset the component state when Plaid Link exits
    setLinkToken(null);
    setStatus('');
    
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

  // Always call the hook, but the global flag prevents multiple library initializations
  const plaid = usePlaidLink(
    linkToken
      ? { token: linkToken, onSuccess: handleSuccess, onExit: handleExit }
      : { token: 'dummy-token', onSuccess: () => {}, onExit: () => {} }
  );

  // Automatically open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && plaid.ready && plaidLinkInitialized) {
      console.log('Plaid Link ready, opening...', { linkToken: linkToken.substring(0, 20) + '...', ready: plaid.ready });
      try {
        plaid.open();
        console.log('Plaid Link opened successfully');
      } catch (error) {
        console.error('Error opening Plaid Link:', error);
        setStatus('Failed to open Plaid Link. Please try again.');
      }
    } else if (linkToken && !plaid.ready) {
      console.log('Plaid Link token ready but not ready to open yet', { linkToken: linkToken.substring(0, 20) + '...', ready: plaid.ready });
    } else if (!plaidLinkInitialized) {
      console.log('Plaid Link not yet initialized globally, waiting...');
    }
  }, [linkToken, plaid.ready, plaid]);

  // Expose createLinkToken to parent components
  useImperativeHandle(ref, () => ({
    createLinkToken: createLinkToken,
  }));

  return (
    <div className="space-y-3">
      {isDemo ? (
        <div>
          <button 
            disabled
            className="bg-gray-600 cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Connect Account
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
            Connect Account
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
});

PlaidLinkButton.displayName = 'PlaidLinkButton';

export default PlaidLinkButton; 