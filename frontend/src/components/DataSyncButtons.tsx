import React, { useState } from 'react';

export default function DataSyncButtons() {
  const [status, setStatus] = useState<string>('');

  const getAccessToken = () => {
    return localStorage.getItem('access_token') || '';
  };

  const syncAccounts = async () => {
    setStatus('Syncing accounts...');
    const access_token = getAccessToken();
    if (!access_token) {
      setStatus('No access token found. Please link an account first.');
      return;
    }
    const res = await fetch('http://localhost:3000/plaid/sync_accounts', {
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
    const res = await fetch('http://localhost:3000/plaid/sync_transactions', {
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
    <div style={{ marginTop: 24 }}>
      <button onClick={syncAccounts} style={{ marginRight: 8 }}>
        Sync Accounts
      </button>
      <button onClick={syncTransactions}>
        Sync Transactions
      </button>
      <div style={{ marginTop: 12 }}>{status}</div>
    </div>
  );
} 