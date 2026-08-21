"use client";

import { useCallback, useEffect, useState } from 'react';
import { useDialog } from './ui/dialog';

/**
 * One row per brokerage connection, with a disconnect that removes only that
 * institution.
 *
 * Until now the only way out was "Disconnect all accounts", which took every
 * brokerage and every bank with it. A user whose Public link has gone bad had to
 * tear down Fidelity and Vanguard to rebuild it. The unit that can actually be
 * connected, reconnected, refreshed and removed is the brokerage authorization,
 * so that is what this lists.
 */

interface SnapTradeConnectionAccount {
  id: string;
  name: string;
  lastHoldingsSync: string | null;
}

interface SnapTradeConnection {
  id: string;
  institution: string;
  disabled?: boolean;
  disabledAt?: string | null;
  statusUnavailable?: boolean;
  lastHoldingsSync: string | null;
  accounts: SnapTradeConnectionAccount[];
}

interface SnapTradeConnectionsProps {
  /** Called after a successful disconnect so the page can re-read its own data. */
  onConnectionRemoved?: () => void | Promise<void>;
  /** Bumped by the parent to force a re-read after a connect or reconnect. */
  refreshKey?: number;
}

function formatSync(value: string | null): string {
  if (!value) return 'never synced';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never synced';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `last updated ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`;
}

export default function SnapTradeConnections({
  onConnectionRemoved,
  refreshKey,
}: SnapTradeConnectionsProps) {
  const [connections, setConnections] = useState<SnapTradeConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { showError, showConfirm, dialog } = useDialog();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setConnections([]);
        return;
      }
      const response = await fetch(`${API_URL}/snaptrade/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to load connections');
      setConnections(data.data?.connections || []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections, refreshKey]);

  const handleDisconnect = async (connection: SnapTradeConnection) => {
    const accountCount = connection.accounts.length;
    // The dialog names what is being destroyed, because this is not reversible by
    // reconnecting: relinking re-imports from the brokerage under new account ids,
    // so renames and category overrides do not come back.
    const confirmed = await showConfirm({
      title: `Disconnect ${connection.institution}?`,
      message:
        `This removes ${accountCount} ${accountCount === 1 ? 'account' : 'accounts'} from ${connection.institution}, `
        + 'along with their imported holdings and transaction history, and takes them out of your totals. '
        + 'Your other connected institutions are not affected. '
        + 'You can reconnect later, but the history will be re-imported fresh and any renames will be lost.',
      confirmLabel: 'Disconnect',
    });
    if (!confirmed) return;

    setRemovingId(connection.id);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(
        `${API_URL}/snaptrade/connections/${encodeURIComponent(connection.id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to disconnect this institution');
      await loadConnections();
      await onConnectionRemoved?.();
    } catch (error) {
      void showError(error instanceof Error ? error.message : 'Failed to disconnect this institution');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-400">Loading connected institutions...</div>;
  }
  if (loadError) {
    return <div className="text-sm text-red-400">{loadError}</div>;
  }
  // Nothing connected is the ordinary state for a new user, and the connect
  // button directly above already says what to do about it.
  if (connections.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-300">Connected institutions</h3>
      <div className="space-y-3">
        {connections.map(connection => {
          const accountCount = connection.accounts.length;
          const isRemoving = removingId === connection.id;
          return (
            <div
              key={connection.id}
              className="rounded-lg border border-gray-600 bg-gray-700 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-words font-medium text-white">{connection.institution}</span>
                    {connection.disabled && (
                      <span className="rounded-full border border-red-700 bg-red-900/20 px-2 py-0.5 text-xs font-medium text-red-300">
                        Needs reconnect
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-gray-400">
                    {accountCount} {accountCount === 1 ? 'account' : 'accounts'} · {formatSync(connection.lastHoldingsSync)}
                  </div>
                  <div className="mt-1 break-words text-xs text-gray-500">
                    {connection.accounts.map(account => account.name).join(', ')}
                  </div>
                </div>
                <button
                  onClick={() => void handleDisconnect(connection)}
                  disabled={isRemoving}
                  className="shrink-0 rounded border border-red-500/40 px-3 py-1 text-sm text-red-300 transition-colors hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRemoving ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {dialog}
    </div>
  );
}
