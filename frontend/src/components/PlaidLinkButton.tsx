"use client";

import React, { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOnExit, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { useAnalytics } from './Analytics';
import { financialServiceCoordinator, SERVICE_NAMES } from '../services/FinancialServiceCoordinator';

// Global flag to prevent multiple Plaid Link initializations
let plaidLinkInitialized = false;

// Function to reset the global flag (useful for testing or when switching users)
export const resetPlaidLinkInitialization = () => {
  plaidLinkInitialized = false;
  console.log('Global Plaid Link initialization flag reset');
};

// Function to manually clear all financial services (useful for debugging)
export const clearAllFinancialServices = () => {
  financialServiceCoordinator.clear();
  console.log('All financial services cleared');
};

// Make the function available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).clearAllFinancialServices = clearAllFinancialServices;
  (window as any).resetPlaidLinkInitialization = resetPlaidLinkInitialization;
}

interface PlaidLinkButtonProps {
  onSuccess?: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit?: () => void;
  isDemo?: boolean;
  forceReinitialize?: boolean; // New prop to force re-initialization
}

export interface PlaidLinkButtonRef {
  createLinkToken: () => void;
}

const PlaidLinkButton = forwardRef<PlaidLinkButtonRef, PlaidLinkButtonProps>(({ onSuccess, onExit, isDemo = false, forceReinitialize = false }, ref) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const { trackEvent, trackConversion } = useAnalytics();

  // Utility function to clean up Plaid Link modal remnants
  const cleanupPlaidLink = useCallback(() => {
    setTimeout(() => {
      // Remove any Plaid Link modal backdrops
      const plaidModals = document.querySelectorAll('[data-plaid-modal], .plaid-link-modal, .plaid-modal');
      plaidModals.forEach(modal => {
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      });
      
      // Remove any Plaid Link iframes
      const plaidIframes = document.querySelectorAll('iframe[src*="plaid.com"]');
      plaidIframes.forEach(iframe => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      });
      
      // Restore body scroll
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      
      // Remove any Plaid Link overlay elements
      const overlays = document.querySelectorAll('.plaid-overlay, .plaid-backdrop');
      overlays.forEach(overlay => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      });
      
      console.log('Plaid Link cleanup completed');
    }, 100);
  }, []);

  // Prevent multiple Plaid Link initializations
  useEffect(() => {
    console.log('PlaidLinkButton useEffect triggered:', {
      plaidLinkInitialized,
      forceReinitialize,
      isDemo
    });
    
    // Skip initialization in demo mode
    if (isDemo) {
      console.log('Demo mode - skipping Plaid Link initialization');
      return;
    }
    
    // Allow re-initialization if forceReinitialize is true
    if (plaidLinkInitialized && !forceReinitialize) {
      console.log('Plaid Link already initialized globally, skipping this instance');
      return;
    }
    
    // Reset flag if forceReinitialize is true
    if (forceReinitialize) {
      console.log('Force reinitialize requested, resetting global flag');
      plaidLinkInitialized = false;
    }
    
    console.log('Setting global Plaid Link initialization flag');
    plaidLinkInitialized = true;
    
    // Don't reset the flag on unmount in production to prevent conflicts
    // The flag will be reset when the user logs out or when explicitly requested
    return () => {
      console.log('Plaid Link component unmounted, keeping global flag for stability');
      
      // Clean up any Plaid Link remnants when component unmounts
      cleanupPlaidLink();
    };
  }, [forceReinitialize, isDemo, cleanupPlaidLink]);

  // Fetch link_token from backend
  const createLinkToken = useCallback(async () => {
    console.log('createLinkToken called with props:', { isDemo, forceReinitialize });
    
    // Don't create tokens in demo mode
    if (isDemo) {
      console.log('Demo mode - not creating link token');
      return;
    }
    
    // Check if other financial services are active
    if (financialServiceCoordinator.hasActiveServices()) {
      const activeServices = financialServiceCoordinator.getActiveServices();
      console.log('Other financial services are active:', activeServices);
      setStatus('Please close other connection windows first...');
      return;
    }
    
    // Register this service as active
    financialServiceCoordinator.registerService(SERVICE_NAMES.PLAID_LINK);
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
  }, [isDemo, forceReinitialize]);

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
        
        // Clean up any Plaid Link modal remnants after successful connection
        cleanupPlaidLink();
        
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
      
      // Clean up any Plaid Link modal remnants after error
      cleanupPlaidLink();
    }
  }, [trackEvent, trackConversion, isDemo, onSuccess, cleanupPlaidLink]);

  const handleExit: PlaidLinkOnExit = useCallback((err, metadata) => {
    console.log('Plaid Link exit:', err, metadata);
    
    // Reset the component state when Plaid Link exits
    setLinkToken(null);
    setStatus('');
    
    // Clear the fallback timer if it exists
    if ((window as any).plaidFallbackTimer) {
      clearTimeout((window as any).plaidFallbackTimer);
      (window as any).plaidFallbackTimer = null;
    }
    
    // Unregister this service immediately
    financialServiceCoordinator.unregisterService(SERVICE_NAMES.PLAID_LINK);
    console.log('Plaid Link service unregistered on exit');
    
    // Clean up any Plaid Link modal remnants that might be causing scroll lock
    cleanupPlaidLink();
    
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
  }, [trackEvent, isDemo, onExit, cleanupPlaidLink]);

  // Always call the hook, but with a dummy token when no real token is available
  const plaid = usePlaidLink(
    linkToken
      ? { token: linkToken, onSuccess: handleSuccess, onExit: handleExit }
      : { token: 'dummy-token', onSuccess: () => {}, onExit: () => {} }
  );

  // Automatically open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && plaid.ready) {
      // Check if we need to set the global flag (in case it was reset)
      if (!plaidLinkInitialized) {
        console.log('Setting global Plaid Link initialization flag (delayed)');
        plaidLinkInitialized = true;
      }
      
      console.log('Plaid Link ready, opening...', { 
        linkToken: linkToken.substring(0, 20) + '...', 
        ready: plaid.ready,
        plaidLinkInitialized 
      });
      
      try {
        plaid.open();
        console.log('Plaid Link opened successfully');
        
        // Set a fallback timer to unregister the service if it's still active after 5 minutes
        // This prevents the service from being stuck in "active" state
        const fallbackUnregisterTimer = setTimeout(() => {
          if (financialServiceCoordinator.isServiceActive(SERVICE_NAMES.PLAID_LINK)) {
            console.log('Fallback: Unregistering Plaid Link service after timeout');
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.PLAID_LINK);
          }
        }, 5 * 60 * 1000); // 5 minutes
        
        // Store the timer so we can clear it if needed
        (window as any).plaidFallbackTimer = fallbackUnregisterTimer;
        
      } catch (error) {
        console.error('Error opening Plaid Link:', error);
        setStatus('Failed to open Plaid Link. Please try again.');
        // Unregister service on error
        financialServiceCoordinator.unregisterService(SERVICE_NAMES.PLAID_LINK);
      }
    } else if (linkToken && !plaid.ready) {
      console.log('Plaid Link token ready but not ready to open yet', { 
        linkToken: linkToken.substring(0, 20) + '...', 
        ready: plaid.ready 
      });
    } else if (!plaidLinkInitialized) {
      console.log('Plaid Link not yet initialized globally, waiting...');
    }
  }, [linkToken, plaid.ready, plaid]);

  // Fallback: Try to open Plaid Link after a delay if it hasn't opened yet
  useEffect(() => {
    if (linkToken && plaid.ready) {
      const fallbackTimer = setTimeout(() => {
        // Check if Plaid Link is still not open after 3 seconds
        const plaidModal = document.querySelector('[data-plaid-modal]');
        if (plaidModal && !plaidModal.querySelector('iframe')) {
          console.log('Fallback: Plaid Link not opened after delay, attempting to open...');
          try {
            plaid.open();
            console.log('Fallback: Plaid Link opened successfully');
          } catch (error) {
            console.error('Fallback: Error opening Plaid Link:', error);
          }
        }
      }, 3000);

      return () => clearTimeout(fallbackTimer);
    }
  }, [linkToken, plaid.ready, plaid]);

  // Expose createLinkToken to parent components
  useImperativeHandle(ref, () => ({
    createLinkToken: createLinkToken,
  }));

  return (
    <div className="space-y-3" data-plaid-modal={!!linkToken ? "true" : undefined}>
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