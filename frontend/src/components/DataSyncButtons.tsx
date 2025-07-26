"use client";

import React, { useState } from 'react';

export default function DataSyncButtons() {
  const [status, setStatus] = useState<string>('');

  const getAccessToken = () => {
    return localStorage.getItem('access_token') || '';
  };

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const syncAccounts = async () => {
    setStatus('Syncing accounts...');
    const access_token = getAccessToken();
    if (!access_token) {
      setStatus('No access token found. Please link an account first.');
      return;
    }
    const res = await fetch(`${API_URL}/plaid/sync_accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token }),
    });
    const data = await res.json();
    if (data.success) {
      setStatus(`Synced ${data.count} accounts.`);
    } else {
      setStatus('Failed to sync accounts.');
    }
  };

  const syncTransactions = async () => {
    setStatus('Syncing transactions...');
    const access_token = getAccessToken();
    if (!access_token) {
      setStatus('No access token found. Please link an account first.');
      return;
    }
    const res = await fetch(`${API_URL}/plaid/sync_transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token }),
    });
    const data = await res.json();
    if (data.success) {
      setStatus(`Synced ${data.count} transactions.`);
    } else {
      setStatus('Failed to sync transactions.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex space-x-3">
        <button 
          onClick={syncAccounts}
          className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
        >
          Sync Accounts
        </button>
        <button 
          onClick={syncTransactions}
          className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
        >
          Sync Transactions
        </button>
      </div>
      {status && (
        <div className="text-sm text-gray-300 bg-gray-700 px-3 py-2 rounded">
          {status}
        </div>
      )}
    </div>
  );
} 