"use client";

import React, { useCallback, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function PlaidLinkButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  // Fetch link_token from backend
  const createLinkToken = useCallback(async () => {
    setStatus('Requesting link token...');
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${API_URL}/plaid/create_link_token`, { method: 'POST' });
    const data = await res.json();
    setLinkToken(data.link_token);
    setStatus('Ready to link your account.');
  }, []);

  // Exchange public_token for access_token
  const onSuccess = useCallback(async (public_token: string) => {
    setStatus('Exchanging public token...');
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${API_URL}/plaid/exchange_public_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token }),
    });
    const data = await res.json();
    if (data.access_token) {
      setStatus('Account linked!');
      localStorage.setItem('access_token', data.access_token);
    } else {
      setStatus('Failed to link account.');
    }
  }, []);

  // Always call the hook, but only use it when linkToken is set
  const plaid = usePlaidLink(
    linkToken
      ? { token: linkToken, onSuccess }
      : { token: 'dummy-token', onSuccess: () => {} }
  );

  return (
    <div>
      <button onClick={createLinkToken} disabled={!!linkToken}>
        Get Plaid Link Token
      </button>
      {linkToken && (
        <button onClick={() => plaid.open()} disabled={!plaid.ready} style={{ marginLeft: 8 }}>
          Connect Bank Account
        </button>
      )}
      <div style={{ marginTop: 12 }}>{status}</div>
    </div>
  );
} 