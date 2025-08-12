"use client";

import React from 'react';
import { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import PlaidLinkButton from './PlaidLinkButton';

interface SeamlessPlaidLinkProps {
  onSuccess?: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit?: () => void;
  isDemo?: boolean;
}

export default function SeamlessPlaidLink({ 
  onSuccess, 
  onExit, 
  isDemo = false
}: SeamlessPlaidLinkProps) {
  return (
    <div className="space-y-4">
      {/* Seamless Connection Interface */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Connect Your Financial Account</h3>
        <p className="text-gray-400 text-sm mb-4">
          Simply click connect and we'll automatically detect what financial data is available from your institution. 
          No need to specify what you want upfront - we'll intelligently gather everything available.
        </p>
        
        {/* Smart Linking Information */}
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mb-4">
          <div className="flex items-center space-x-2">
            <div className="text-blue-400">💡</div>
            <div className="text-blue-300 text-sm">
              <strong>Smart Linking:</strong> We'll collect consent for all available data types upfront, 
              so you can access them later without relinking your account.
            </div>
          </div>
        </div>
        
        {/* Connect Button */}
        <PlaidLinkButton
          onSuccess={onSuccess}
          onExit={onExit}
          isDemo={isDemo}
        />
        
        {/* What Happens Next */}
        <div className="mt-4 text-sm text-gray-400">
          <p><strong>What happens next:</strong></p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Choose your financial institution</li>
            <li>Log in with your credentials</li>
            <li>We'll automatically detect available data types</li>
            <li>Access transactions, investments, and more seamlessly</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
