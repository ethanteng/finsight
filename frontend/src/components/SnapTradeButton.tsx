"use client";

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { SnapTradeReact } from 'snaptrade-react';
import { useWindowMessage } from 'snaptrade-react/hooks/useWindowMessage';
import { financialServiceCoordinator, SERVICE_NAMES } from '../services/FinancialServiceCoordinator';
import { snapTradeAccountHealth } from '../lib/snaptrade-account-health';
import AccountCard from './AccountCard';

interface SnapTradeStatus {
  status: string;
  snapTradeUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SnapTradeAccount {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  institution?: string;
  balance?: number;
  /** True when this account's brokerage authorization is disabled. */
  connectionDisabled?: boolean;
  brokerageAuthorizationId?: string;
  /**
   * 'public' when the row comes from the direct Public.com feed rather than from
   * SnapTrade. Those accounts have no brokerage authorization, so none of
   * SnapTrade's connection health applies to them.
   */
  source?: string;
  /** Balance is a sum of positions, so it cannot see uninvested cash. */
  balanceDerivedFromPositions?: boolean;
}

interface SnapTradeTokenStatus {
  connected: boolean;
  status: string;
  error?: string;
  lastChecked?: string;
  /** Per-brokerage detail when status is LOGIN_REQUIRED. */
  disabledConnections?: Array<{ authorizationId: string; institutionName: string | null }>;
}

interface SnapTradeButtonProps {
  onAccountsUpdated?: () => void;
  snapTradeStatus?: SnapTradeTokenStatus | null;
  /**
   * Brokerage authorization to repair when the user opens the portal. Set when
   * the profile page is offering to fix a connection SnapTrade reports as
   * disabled; leave unset for an ordinary new connection.
   */
  reconnectAuthorizationId?: string;
  /**
   * Hide the connect button and keep the account list plus the imperative
   * handle.
   *
   * The accounts page now offers one "Add an account" flow that asks for the
   * institution and routes from there, so a SnapTrade-labelled button beside it
   * puts the provider choice back in front of the user. Registration, the
   * portal, the window-message lifecycle and the account cards all still live
   * here; only the button goes.
   *
   * A pending reconnect is the exception -- repairing a named connection is not
   * "add an account" -- so the page leaves the button visible for that.
   */
  headless?: boolean;
  /**
   * Reports whether SnapTrade has registered this user, which is what the
   * portal needs before it can mint a connection link. The shared "Add an
   * account" picker uses it to say "setting up" on its investment rows instead
   * of offering a click that cannot go anywhere yet.
   */
  onReadyChange?: (ready: boolean) => void;
  /**
   * Hands the brokerage accounts to the parent as they load.
   *
   * The accounts page lists every account together now, whichever provider
   * reported it, so it needs these rows rather than a second list rendered
   * down here. Separate from `onAccountsUpdated`, which is a "something
   * changed, go refresh" signal several callers already depend on.
   */
  onAccountsLoaded?: (accounts: SnapTradeAccount[]) => void;
  /**
   * Progress and failure text for a connect request the parent started.
   *
   * Headless, the component has nowhere of its own to say "still setting up" or
   * "that failed, try again" -- and the click happened in the shared picker, so
   * the message belongs next to it.
   */
  onConnectStatus?: (message: string) => void;
}

export interface SnapTradeButtonRef {
  /**
   * Open the SnapTrade portal, optionally already on one brokerage.
   *
   * `brokerSlug` is what the institution picker selected, so the portal does not
   * ask the same question a second time.
   */
  connect: (brokerSlug?: string) => void;
  /** Whether SnapTrade has registered this user yet; the portal needs that first. */
  isReady: () => boolean;
}

const SnapTradeButton = forwardRef<SnapTradeButtonRef, SnapTradeButtonProps>(function SnapTradeButton(
  { onAccountsUpdated, snapTradeStatus: snapTradeTokenStatus, reconnectAuthorizationId, headless = false, onReadyChange, onAccountsLoaded, onConnectStatus },
  ref,
) {
  const [status, setStatus] = useState<string>('loading');
  const [snapTradeStatus, setSnapTradeStatus] = useState<SnapTradeStatus | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<SnapTradeAccount[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);

  // Modal state for SnapTrade connection portal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [redirectLink, setRedirectLink] = useState<string | null>(null);
  // A connect request that arrived before registration was ready, held until it
  // is. See the imperative handle below for why this is not simply dropped.
  const [pendingConnect, setPendingConnect] = useState<
    { brokerSlug?: string; retried: boolean } | null
  >(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Use the useWindowMessage hook for handling SnapTrade events
  useWindowMessage({
    handleSuccess: (data) => {
      console.log('SnapTrade connection successful via window message:', data);
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
      setIsModalOpen(false);
      setRedirectLink(null);
      // Recompute cached snapshot for Ask Linc (live SnapTrade APIs already power the UI)
      void (async () => {
        await checkConnectedAccounts();
        try {
          const token = localStorage.getItem('auth_token');
          if (token && API_URL) {
            const res = await fetch(`${API_URL}/api/refresh-summary`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              console.warn('POST /api/refresh-summary after SnapTrade connect failed:', res.status);
            }
          }
        } catch (e) {
          console.warn('Failed to refresh financial snapshot for Ask Linc after SnapTrade connect', e);
        }
      })();
    },
    handleError: (error) => {
      console.error('SnapTrade connection error via window message:', error);
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
      setStatus('error');
      setIsModalOpen(false);
      setRedirectLink(null);
    },
    handleExit: () => {
      console.log('User exited SnapTrade connection via window message');
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
      setIsModalOpen(false);
      setRedirectLink(null);
    },
    close: () => {
      console.log('SnapTrade modal closed via window message');
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
      setIsModalOpen(false);
      setRedirectLink(null);
    },
  });

  useEffect(() => {
    checkSnapTradeStatus();
  }, []);

  // Auto-initialize SnapTrade if not already initialized (with delay to avoid conflicts)
  useEffect(() => {
    if (status === 'not_initialized' && !isInitializing) {
      console.log('Auto-initializing SnapTrade with delay to avoid conflicts...');
      // Add a delay to prevent conflicts with other components initializing
      const timer = setTimeout(() => {
        initializeSnapTrade();
      }, 2000); // 2 second delay

      return () => clearTimeout(timer);
    }
  }, [status, isInitializing]);

  useEffect(() => {
    if (snapTradeStatus?.status === 'registered') {
      checkConnectedAccounts();
    }
  }, [snapTradeStatus]);

  // Registration state lives here, but the shared "Add an account" picker is
  // what has to decide how to present an investment row.
  useEffect(() => {
    onReadyChange?.(status === 'registered' || status === 'connected');
  }, [status, onReadyChange]);

  // Drain a connect request that arrived before registration was ready.
  useEffect(() => {
    if (!pendingConnect) return;

    if (status === 'registered' || status === 'connected') {
      setPendingConnect(null);
      onConnectStatus?.('');
      connectSnapTrade(undefined, pendingConnect.brokerSlug);
      return;
    }

    // A read or a registration is in flight; wait for where it lands rather
    // than starting a second one alongside it.
    if (status === 'loading' || isInitializing) return;

    // Registration is not in place and nothing is trying to establish it. One
    // attempt is the whole reason for holding the request -- a single failed
    // status read is all it used to take to strand the user -- so give up only
    // once that attempt has also failed.
    if (!pendingConnect.retried) {
      setPendingConnect({ ...pendingConnect, retried: true });
      initializeSnapTrade();
      return;
    }

    // Out of options. Say so: a picker row that swallowed a click with nothing
    // to show for it is the failure mode this whole path exists to avoid.
    setPendingConnect(null);
    onConnectStatus?.(
      'We could not set up investment connections just now. Please try again.',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isInitializing, pendingConnect]);

  const checkSnapTradeStatus = async () => {
    try {
      setStatus('loading');

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/status/user`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSnapTradeStatus(data);
        setStatus(data.status);
      } else if (response.status === 404) {
        setStatus('not_initialized');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Error checking SnapTrade status:', error);
      setStatus('error');
    }
  };

  const checkConnectedAccounts = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/accounts`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('SnapTrade accounts:', data);
        if (data.data?.accounts) {
          setConnectedAccounts(data.data.accounts);
          onAccountsLoaded?.(data.data.accounts);
          // Notify parent component that accounts have been updated
          if (onAccountsUpdated) {
            onAccountsUpdated();
          }
        }
      } else {
        console.log('No connected accounts found or error:', response.status);
        setConnectedAccounts([]);
        onAccountsLoaded?.([]);
      }
    } catch (error) {
      console.error('Error checking connected accounts:', error);
      setConnectedAccounts([]);
      onAccountsLoaded?.([]);
    }
  };

  const initializeSnapTrade = async () => {
    try {
      setIsInitializing(true);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('SnapTrade initialized:', data);
        await checkSnapTradeStatus(); // Refresh status
      } else {
        const errorData = await response.json();
        console.error('SnapTrade initialization failed:', errorData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Error initializing SnapTrade:', error);
      setStatus('error');
    } finally {
      setIsInitializing(false);
    }
  };

  /**
   * Opens the SnapTrade portal. When `authorizationToReconnect` is set, repairs
   * that brokerage authorization rather than adding another connection to the
   * same brokerage, which is what the plain connect flow would do when a user
   * is trying to fix a disabled connection.
   *
   * `brokerSlug` opens the portal on one brokerage, so a user who already named
   * their institution in the shared "Add an account" search is not asked again.
   */
  const connectSnapTrade = async (authorizationToReconnect?: string, brokerSlug?: string) => {
    try {
      // Check if other financial services are active
      if (financialServiceCoordinator.hasActiveServices()) {
        const activeServices = financialServiceCoordinator.getActiveServices();
        console.log('Other financial services are active, cannot start SnapTrade:', activeServices);
        setStatus('error');
        return;
      }

      // Register this service as active
      financialServiceCoordinator.registerService(SERVICE_NAMES.SNAPTRADE);
      setIsInitializing(true);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...(authorizationToReconnect ? { reconnect: authorizationToReconnect } : {}),
          ...(brokerSlug && !authorizationToReconnect ? { broker: brokerSlug } : {}),
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('SnapTrade login redirect:', data);

        // Use the modal approach instead of opening in new tab
        if (data.data?.redirectURI) {
          setRedirectLink(data.data.redirectURI);
          setIsModalOpen(true);
        }
      } else {
        const errorData = await response.json();
        console.error('SnapTrade login failed:', errorData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Error connecting SnapTrade:', error);
      setStatus('error');
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
    } finally {
      setIsInitializing(false);
    }
  };

  const disconnectSnapTrade = async () => {
    try {
      setIsInitializing(true);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        console.log('SnapTrade disconnected successfully');
        await checkSnapTradeStatus(); // Refresh status
      } else {
        const errorData = await response.json();
        console.error('SnapTrade disconnect failed:', errorData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Error disconnecting SnapTrade:', error);
      setStatus('error');
    } finally {
      setIsInitializing(false);
    }
  };

  const needsReconnect = Boolean(reconnectAuthorizationId);

  const getButtonText = () => {
    if (needsReconnect && (status === 'registered' || status === 'connected')) {
      return isInitializing ? 'Reconnecting...' : 'Reconnect Account';
    }
    switch (status) {
      case 'loading':
        return 'Loading...';
      case 'not_authenticated':
        return 'Please log in';
      case 'not_initialized':
        return isInitializing ? 'Initializing...' : 'Setting up SnapTrade...';
      case 'registered':
        return isInitializing ? 'Connecting...' : 'Connect Account';
      case 'connected':
        return 'SnapTrade Active';
      case 'disconnected':
        return 'Reconnect SnapTrade';
      case 'error':
        return 'Error - Try Again';
      default:
        return 'Connect SnapTrade';
    }
  };

  const getButtonColor = () => {
    if (needsReconnect && (status === 'registered' || status === 'connected')) {
      return 'bg-amber-600 hover:bg-amber-700 text-white';
    }
    switch (status) {
      case 'registered':
      case 'connected':
        return 'bg-green-600 hover:bg-green-700 text-white';
      case 'error':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'loading':
      case 'not_initialized':
        return 'bg-gray-600 cursor-not-allowed text-gray-300';
      default:
        return 'bg-blue-600 hover:bg-blue-700 text-white';
    }
  };

  const isButtonDisabled = () => {
    return status === 'loading' || isInitializing || status === 'not_authenticated' || status === 'not_initialized';
  };

  /**
   * Let the shared "Add an account" flow open the portal.
   *
   * When registration has not landed -- or failed, which a transient
   * `/snaptrade/status/user` error is enough to cause -- the request is
   * remembered and retried rather than dropped. Dropping it was a dead end:
   * this component is headless, so there is no button left for the user to
   * press to retry, and every brokerage in the picker would stay unreachable
   * for the rest of the session over one failed status call.
   */
  useImperativeHandle(ref, () => ({
    connect: (brokerSlug?: string) => {
      if (status === 'registered' || status === 'connected') {
        connectSnapTrade(undefined, brokerSlug);
        return;
      }
      // Hold it and let the effect below decide what registration needs. An
      // undefined slug still means "asked, with no particular brokerage", which
      // is why this is a record rather than a nullable slug.
      setPendingConnect({ brokerSlug, retried: false });
      onConnectStatus?.('Setting up your investment connection…');
    },
    isReady: () => status === 'registered' || status === 'connected',
  }));

  const handleClick = () => {
    if (status === 'error') {
      initializeSnapTrade();
    } else if (needsReconnect || status === 'registered') {
      // Reconnect must work even when the registration row already says
      // "connected"/"registered": that status only means SnapTrade knows the
      // user, not that every brokerage authorization is healthy. Without this
      // branch a disabled connection shows ✗ marks and error text but the
      // button is a no-op when status is not exactly "registered".
      connectSnapTrade(reconnectAuthorizationId);
    } else if (status === 'disconnected') {
      initializeSnapTrade();
    }
  };

  return (
    <div className="space-y-4">
      {/* In headless mode the shared "Add an account" flow owns connecting, so
          the ordinary connect button stays hidden. Two exceptions still need a
          visible control: repairing a named disabled authorization, and retrying
          after registration/setup failed — otherwise investment search rows stay
          disabled for the rest of the page session with nothing the user can click. */}
      {(!headless || needsReconnect || status === 'error') && (
        <div className="flex items-center space-x-4">
            <button
              onClick={handleClick}
              disabled={isButtonDisabled()}
              className={`px-4 py-2 font-medium rounded-lg transition-colors ${getButtonColor()} ${
                isButtonDisabled() ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {getButtonText()}
            </button>

            {status === 'loading' && (
              <div className="text-sm text-gray-400 bg-gray-800 border border-gray-600 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                  <span>Checking SnapTrade status...</span>
                </div>
              </div>
            )}
        </div>
      )}



      {/* Headless means the page lists every account together, this component's
          rows included, so rendering them again here would show each brokerage
          account twice. */}
      {!headless && connectedAccounts.length > 0 && (
        <div className="mt-4">
          <div className="space-y-3">
            {connectedAccounts.map((account) => {
              // Shared with the accounts page's combined list, so the two
              // renderings cannot disagree about whether a connection is broken.
              const { isHealthy, isDirect, issue: accountIssue } = snapTradeAccountHealth(
                account,
                snapTradeTokenStatus,
              );

              return (
                <AccountCard
                  key={account.id}
                  name={account.name}
                  health={{
                    ok: isHealthy,
                    title: isHealthy
                      ? (isDirect ? 'Read directly from Public' : 'Connection active')
                      : `Connection issue: ${accountIssue || 'Unknown error'}`,
                  }}
                  detail={`${account.institution ? `${account.institution} • ` : ''}${account.type}${account.subtype ? ` • ${account.subtype}` : ''}`}
                  issue={accountIssue}
                  balance={account.balance}
                  balanceFallback="Not reported"
                  balanceFallbackTitle="This provider did not report a balance for this account."
                  /* A sum of positions is a floor: it cannot see uninvested cash,
                     so presenting it as a reported total would overstate what is
                     known. Same caveat the finances page carries. */
                  balanceNote={account.balanceDerivedFromPositions ? 'from positions' : null}
                  balanceNoteTitle="Summed from this account's positions; any uninvested cash is not included."
                />
              );
            })}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-400 bg-gray-800 border border-red-500/30 rounded-lg p-3">
          <div className="font-medium text-red-300 mb-1">Connection Error</div>
          <div className="text-gray-400">There was an error connecting to SnapTrade. Please try again.</div>
        </div>
      )}

      {/* SnapTrade Connection Modal */}
      {redirectLink && (
        <div data-snaptrade-modal="true">
          <SnapTradeReact
            loginLink={redirectLink}
            isOpen={isModalOpen}
                      close={() => {
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
            setIsModalOpen(false);
            setRedirectLink(null);
          }}
          onSuccess={(data) => {
            console.log('SnapTrade connection successful:', data);
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
            setIsModalOpen(false);
            setRedirectLink(null);
            // Refresh connected accounts
            checkConnectedAccounts();
          }}
          onError={(error) => {
            console.error('SnapTrade connection error:', error);
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
            setStatus('error');
            setIsModalOpen(false);
            setRedirectLink(null);
          }}
          onExit={() => {
            console.log('User exited SnapTrade connection');
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
            setIsModalOpen(false);
            setRedirectLink(null);
          }}
            contentLabel="Connect Account via SnapTrade"
          />
        </div>
      )}
    </div>
  );
});

export default SnapTradeButton;
