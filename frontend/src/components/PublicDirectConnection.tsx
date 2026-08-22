"use client";

import { useCallback, useEffect, useState } from 'react';
import { useDialog } from './ui/dialog';

/**
 * Direct Public.com connection, offered only to users who already hold a Public
 * link through SnapTrade.
 *
 * A stopgap. SnapTrade cannot complete an initial holdings sync for Public's
 * managed-yield products -- Treasury, High Yield Cash and Bond accounts return
 * HTTP 425 indefinitely -- so those balances are missing entirely. Reading
 * Public's own API recovers them until that is fixed upstream.
 *
 * The panel is deliberately blunt about what the key can do. Public's personal
 * API is not read-only and the secret cannot be scope-limited, so a user should
 * decide with that in front of them rather than in a tooltip.
 */

interface PublicApiStatus {
  eligible: boolean;
  configured: boolean;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
}

interface PublicDirectConnectionProps {
  /** Called after connecting or disconnecting so the page can re-read its data. */
  onChanged?: () => void | Promise<void>;
  refreshKey?: number;
}

function formatVerified(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export default function PublicDirectConnection({ onChanged, refreshKey }: PublicDirectConnectionProps) {
  const [status, setStatus] = useState<PublicApiStatus | null>(null);
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { showError, showConfirm, dialog } = useDialog();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const loadStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;
      const response = await fetch(`${API_URL}/public-api/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const payload = await response.json();
      setStatus(payload?.data ?? null);
    } catch {
      // A failed status read just leaves the panel hidden; it is not worth an
      // error banner on a settings page for an optional stopgap.
    }
  }, [API_URL]);

  useEffect(() => { loadStatus(); }, [loadStatus, refreshKey]);

  const connect = async () => {
    const trimmed = secret.trim();
    if (!trimmed) {
      setFormError('Enter the secret key from your Public settings.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/public-api/secret`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: trimmed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(payload?.error || 'Could not connect to Public.');
        return;
      }
      // Cleared on success so the key does not sit in a form field, and in React
      // state, for the rest of the session.
      setSecret('');
      await loadStatus();
      await onChanged?.();
    } catch {
      setFormError('Could not connect to Public.');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    const confirmed = await showConfirm({
      title: 'Remove your Public API key?',
      message:
        'Ask Linc will stop reading Public directly and fall back to your SnapTrade connection. '
        + 'Your Treasury, High Yield Cash and Bond account balances will go missing again until Public and SnapTrade resolve the sync issue.',
      confirmLabel: 'Remove key',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/public-api/secret`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        showError(payload?.error || 'Could not remove the key.');
        return;
      }
      await loadStatus();
      await onChanged?.();
    } catch {
      showError('Could not remove the key.');
    }
  };

  // Hidden entirely for users with no Public connection. This is a workaround for
  // one broken vendor path, not an invitation to hand us a brokerage credential.
  if (!status?.eligible) return null;

  const verified = formatVerified(status.lastVerifiedAt);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">Public — direct connection</h3>
          <p className="mt-1 text-sm text-gray-600">
            Public&rsquo;s Treasury, High Yield Cash and Bond accounts don&rsquo;t sync through our
            usual provider — they report balances as unavailable. Connecting your own Public API key
            restores them.
          </p>
        </div>
        {status.configured && (
          <span className="shrink-0 rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
            Connected
          </span>
        )}
      </div>

      {status.configured ? (
        <div className="mt-3 space-y-2">
          {verified && <p className="text-sm text-gray-600">Last confirmed working {verified}</p>}
          {status.lastError && (
            <p className="text-sm text-red-600">{status.lastError}</p>
          )}
          {/* A key Public has rejected can be replaced in place. Requiring
              remove-then-reconnect would mean deliberately deleting the only
              working configuration to fix a broken one. */}
          {status.lastError && (
            <div className="space-y-2 pt-1">
              <label className="block text-sm" htmlFor="public-api-secret-replace">
                Replace with a new secret key
              </label>
              <input
                id="public-api-secret-replace"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={event => setSecret(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Paste your new Public secret key"
              />
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <button
                type="button"
                onClick={connect}
                disabled={saving}
                className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Replace key'}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={disconnect}
            className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Remove key
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Before you do this</p>
            <p className="mt-1">
              Public&rsquo;s API key can place and cancel trades, and Public doesn&rsquo;t offer a
              read-only version. Ask Linc only ever reads your balances and positions, and stores
              the key encrypted — but you are handing over a key that could do more. You can revoke
              it in Public at any time.
            </p>
          </div>
          <label className="block text-sm" htmlFor="public-api-secret">
            Secret key from your Public settings
          </label>
          <input
            id="public-api-secret"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={event => setSecret(event.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Paste your Public secret key"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="button"
            onClick={connect}
            disabled={saving}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {saving ? 'Connecting…' : 'Connect Public'}
          </button>
        </div>
      )}
      {dialog}
    </div>
  );
}
