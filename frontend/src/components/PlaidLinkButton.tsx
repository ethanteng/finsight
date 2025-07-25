import React, { useCallback, useState, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function PlaidLinkButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  // Fetch link_token from backend
  const createLinkToken = useCallback(async () => {
    setStatus('Requesting link token...');
    const res = await fetch('http://localhost:3000/plaid/create_link_token', { method: 'POST' });
    const data = await res.json();
    setLinkToken(data.link_token);
    setStatus('Ready to link your account.');
  }, []);

  // Exchange public_token for access_token
  const onSuccess = useCallback(async (public_token: string) => {
    setStatus('Exchanging public token...');
    const res = await fetch('http://localhost:3000/plaid/exchange_public_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token }),
    });
    const data = await res.json();
    if (data.access_token) {
      setStatus('Account linked!');
      // Optionally, store access_token in localStorage or state for further API calls
    } else {
      setStatus('Failed to link account.');
    }
  }, []);

  const plaid = linkToken ? usePlaidLink({ token: linkToken, onSuccess }) : null;

  return (
    <div>
      <button onClick={createLinkToken} disabled={!!linkToken}>
        Get Plaid Link Token
      </button>
      {plaid && (
        <button onClick={() => plaid.open()} disabled={!plaid.ready} style={{ marginLeft: 8 }}>
          Connect Bank Account
        </button>
      )}
      <div style={{ marginTop: 12 }}>{status}</div>
    </div>
  );
} 