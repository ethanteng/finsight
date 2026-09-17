"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PlaidLinkButton, { PlaidLinkButtonRef, resetPlaidLinkInitialization } from '../../components/PlaidLinkButton';
import SnapTradeConnections from '../../components/SnapTradeConnections';
import PlaidConnections from '../../components/PlaidConnections';
import PublicDirectConnection from '../../components/PublicDirectConnection';
import TransactionHistory from '../../components/TransactionHistory';
import UserProfile from '../../components/UserProfile';
import InvestmentPortfolio from '../../components/InvestmentPortfolio';
import SnapTradeButton, { SnapTradeButtonRef, SnapTradeAccount } from '../../components/SnapTradeButton';
import AccountCard, { AccountCardProps } from '../../components/AccountCard';
import { snapTradeAccountHealth } from '../../lib/snaptrade-account-health';
import AddAccountButton, { AddAccountButtonRef, InstitutionOption } from '../../components/AddAccountButton';
import ManualAccountList from '../../components/ManualAccountList';
import PageMeta from '../../components/PageMeta';
import type { ManualAccount } from '../../types/manual-account';
import { resolveAccountBalance } from '../../lib/account-balance';
import { normalizeAssetType } from '../../lib/asset-class';
import { normalizeLabel } from '../../lib/label-normalization';
import AuthenticatedPageHeader from '../../components/authenticated/AuthenticatedPageHeader';
import {
  CONNECT_ACCOUNTS_INTENT,
  CONNECT_ACCOUNTS_STORAGE_KEY,
  CONNECT_INTENT_PARAM,
} from '../../lib/connect-accounts';
import { loginUrlFor } from '../../lib/post-login-redirect';

// (removed) local InvestmentHolding type - no longer used after snapshot refactor

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
  balance: {
    // Null when the provider reported no balance — rendered as "—", never as $0.
    current: number | null;
    available: number | null;
    iso_currency_code: string;
  };
  institution?: string;
  /** True when the provider no longer reports the account (closed at the institution). */
  isClosed?: boolean;
  /** Last time a provider refresh saw the account, when known. */
  lastSeenAt?: string | null;
}

interface SnapTradeData {
  open_pnl?: number;
  average_purchase_price?: number;
  account_name?: string;
  account_number?: string;
  activity_type?: string;
  description?: string;
  trade_date?: string;
  settlement_date?: string;
  fee?: number;
  institution?: string;
}

interface Security {
  id: string;
  name: string;
  type: string;
  ticker?: string;
}

interface Account {
  id: string;
  name: string;
  type: string;
  number?: string;
}

interface InvestmentTransaction {
  id: string;
  account_id: string;
  security_id: string;
  amount: number;
  date: string;
  name: string;
  quantity: number;
  price: number;
  fees: number;
  type: string;
  iso_currency_code: string;
  institution_value?: number;
  value?: number;
  snapTradeData?: SnapTradeData;
}

interface InvestmentData {
  portfolio: {
    totalValue: number;
    assetAllocation: Array<{
      type: string;
      value: number;
      percentage: number;
    }>;
    holdingCount: number;
    securityCount: number;
  };
  holdings: Array<{
    id: string;
    account_id: string;
    security_id: string;
    institution_value: number;
    institution_price: number;
    institution_price_as_of: string;
    cost_basis: number;
    quantity: number;
    iso_currency_code: string;
    security_name?: string;
    security_type?: string;
    ticker_symbol?: string;
    name?: string;
    type?: string;
    value?: number;
    snapTradeData?: SnapTradeData;
  }>;
  transactions: Array<{
    id: string;
    account_id: string;
    security_id: string;
    amount: number;
    date: string;
    name: string;
    quantity: number;
    price: number;
    fees: number;
    type: string;
    iso_currency_code: string;
  }>;
  // Additional fields for SnapTrade integration
  investment_transactions?: InvestmentTransaction[];
  total_investment_transactions?: number;
  securities?: Security[];
  accounts?: Account[];
  item?: Record<string, unknown>;
  analysis?: {
    portfolio: {
      totalValue: number;
      assetAllocation: Array<{
        type: string;
        value: number;
        percentage: number;
      }>;
      holdingCount: number;
      securityCount: number;
    };
    activity: {
      totalTransactions: number;
      totalVolume: number;
      activityByType: Record<string, number>;
      averageTransactionSize: number;
    };
  };
}

interface TokenStatus {
  id: string;
  createdAt: string;
  lastChecked: string | null;
  isActive: boolean;
  lastError: string | null;
  institutionName: string | null;
  itemId: string | null;
}

interface SnapTradeStatus {
  connected: boolean;
  status: string;
  error?: string;
  lastChecked?: string;
  snapTradeUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Brokerage connections that are disabled and can be repaired in place. */
  reconnectAuthorizationIds?: string[];
  /** Disabled connections, per brokerage, so health can be attributed correctly. */
  disabledConnections?: Array<{ authorizationId: string; institutionName: string | null }>;
}

export default function ProfilePage() {
  const [connectedAccounts, setConnectedAccounts] = useState<Account[]>([]);
  const [investmentData, setInvestmentData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tokenStatuses, setTokenStatuses] = useState<TokenStatus[]>([]);
  const [snapTradeConnectionsKey, setSnapTradeConnectionsKey] = useState(0);
  const [plaidConnectionsKey, setPlaidConnectionsKey] = useState(0);
  const [publicDirectKey, setPublicDirectKey] = useState(0);
  const [snapTradeStatus, setSnapTradeStatus] = useState<SnapTradeStatus | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    status?: string;
    tier?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    stripeCustomerId?: string;
    accessLevel?: string;
  } | null>(null);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string>('');
  // Progress/error text from whichever provider flow the picker started, lifted
  // out of the (now hidden) provider buttons so it appears next to the control
  // the user actually clicked.
  const [plaidLinkStatus, setPlaidLinkStatus] = useState('');
  const [snapTradeConnectStatus, setSnapTradeConnectStatus] = useState('');
  // Brokerage accounts, lifted out of SnapTradeButton so one list can hold every
  // account whichever provider reported it.
  const [snapTradeAccounts, setSnapTradeAccounts] = useState<SnapTradeAccount[]>([]);
  // Whether SnapTrade has registered this user yet. Owned by SnapTradeButton,
  // which is where the status call lives; mirrored here so the shared picker can
  // grey out investment rows rather than offering a click that cannot land.
  const [snapTradeReady, setSnapTradeReady] = useState(false);
  const [manualAccounts, setManualAccounts] = useState<ManualAccount[]>([]);
  // Set from the add-accounts deep link on mount. The param stays in the URL
  // until auto-connect consumes it, so a Strict Mode remount still sees the
  // intent while a refresh after open does not reopen the picker.
  const [wantsToAddAccount, setWantsToAddAccount] = useState(false);
  const autoConnectTriggeredRef = useRef(false);
  const plaidLinkButtonRef = useRef<PlaidLinkButtonRef>(null);
  const snapTradeButtonRef = useRef<SnapTradeButtonRef>(null);
  const addAccountButtonRef = useRef<AddAccountButtonRef>(null);
  const router = useRouter();

  // Ref for TransactionHistory component to trigger refresh
  const transactionHistoryRef = useRef<{ refresh: () => void }>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;


  // Load token statuses for the authenticated user.
  const loadTokenStatuses = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.log('⚠️ No auth token found');
        return;
      }

      console.log('📡 Fetching token statuses from:', `${API_URL}/profile/tokens`);

      const response = await fetch(`${API_URL}/profile/tokens`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📥 Token statuses response:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Token statuses loaded:', data.tokens?.length || 0, 'tokens');
        console.log('📋 Token statuses data:', data.tokens);
        setTokenStatuses(data.tokens || []);
      } else {
        console.error('❌ Failed to load token statuses:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error loading token statuses:', error);
    }
  }, [API_URL]);

  // Load SnapTrade status for the authenticated user.
  const loadSnapTradeStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.log('⚠️ No auth token found');
        return;
      }

      console.log('📡 Fetching SnapTrade status from:', `${API_URL}/profile/snaptrade-status`);

      const response = await fetch(`${API_URL}/profile/snaptrade-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📥 SnapTrade status response:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ SnapTrade status loaded:', data);
        setSnapTradeStatus(data);
      } else {
        console.error('❌ Failed to load SnapTrade status:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error loading SnapTrade status:', error);
    }
  }, [API_URL]);

  // Load subscription status.
  const loadSubscriptionStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/stripe/subscription-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionStatus(data);
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    }
  }, [API_URL]);

  // Handle subscription management
  const handleManageSubscription = async () => {
    setIsManagingSubscription(true);
    try {
      // Use environment variable for Stripe customer portal URL
      const portalUrl = process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL;
      if (!portalUrl) {
        throw new Error('Stripe customer portal URL not configured');
      }
      window.location.href = portalUrl;
    } catch (error) {
      console.error('Error opening subscription management:', error);
      setError('Failed to open subscription management');
    } finally {
      setIsManagingSubscription(false);
    }
  };

  const loadConnectedAccounts = useCallback(async () => {
    console.log('API_URL in function:', API_URL);

    setLoading(true);
    setError('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('Sending auth token:', token.substring(0, 20) + '...');
      } else {
        console.log('No auth token found in localStorage');
      }

      const requestUrl = `${API_URL}/plaid/all-accounts`;
      console.log('Making request to:', requestUrl);
      console.log('Request headers:', headers);

      const res = await fetch(requestUrl, {
        method: 'GET',
        headers,
      });

      console.log('Response status:', res.status);
      console.log('Response ok:', res.ok);

      if (res.ok) {
        const data = await res.json();
        const accounts = data.accounts || [];
        console.log(`📊 Received ${accounts.length} accounts from backend`);
        setConnectedAccounts(accounts);
      } else {
        if (res.status === 401) {
          setError('Authentication required. Please log in.');
        } else {
          setError('Failed to load accounts');
        }
      }
    } catch (error) {
      console.error('Error in loadConnectedAccounts:', error);
      setError('Error loading accounts');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // NEW: Load SnapTrade holdings data
  const loadSnapTradeHoldings = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        return null;
      }

      const res = await fetch(`${API_URL}/snaptrade/holdings`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Received SnapTrade holdings data:', data);
        return data.data;
      } else {
        console.log('Failed to load SnapTrade holdings:', res.status);
        return null;
      }
    } catch (err) {
      console.error('Error loading SnapTrade holdings:', err);
      return null;
    }
  }, [API_URL]);

  // Load manual accounts
  const loadManualAccounts = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        return;
      }

      const res = await fetch(`${API_URL}/api/manual-accounts`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setManualAccounts(data.data);
        }
      }
    } catch (err) {
      console.error('Error loading manual accounts:', err);
    }
  }, [API_URL]);

  // NEW: Load SnapTrade activities data
  const loadSnapTradeActivities = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        return null;
      }

      const res = await fetch(`${API_URL}/snaptrade/activities`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Received SnapTrade activities data:', data);
        return data.data?.activities || []; // Return the activities array, not the whole data object
      } else {
        console.log('Failed to load SnapTrade activities:', res.status);
        return [];
      }
    } catch (err) {
      console.error('Error loading SnapTrade activities:', err);
      return [];
    }
  }, [API_URL]);

  // Function to merge Plaid and SnapTrade investment data
  const mergeInvestmentData = useCallback((plaidData: InvestmentData | null, snapTradeData: Record<string, unknown>[] | null, snapTradeActivities: Record<string, unknown>[] | null) => {
    if (!plaidData && !snapTradeData) {
      return null;
    }

    // Ensure snapTradeActivities is always an array
    const activities = snapTradeActivities || [];

    // Convert SnapTrade holdings to the format expected by InvestmentPortfolio
    const snapTradeHoldingsFormatted = snapTradeData ? snapTradeData.flatMap((accountHolding: Record<string, unknown>) => {
      console.log('Processing SnapTrade account holding:', accountHolding);

      if (!accountHolding.account) {
        console.log('Skipping account holding - missing account');
        return [];
      }

      const holdings = [];

      // Handle accounts with positions (investments)
      if (accountHolding.positions && Array.isArray(accountHolding.positions) && accountHolding.positions.length > 0) {
        (accountHolding.positions as Record<string, unknown>[]).forEach((position: Record<string, unknown>) => {
          const positionValue = (Number(position.price) || 0) * (Number(position.units) || 0);
          const costBasis = (Number(position.average_purchase_price) || 0) * (Number(position.units) || 0);

          console.log('Processing position:', {
            symbol: ((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.symbol,
            description: ((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.description,
            units: position.units,
            price: position.price,
            value: positionValue,
            costBasis: costBasis
          });

          holdings.push({
            id: `${(accountHolding.account as Record<string, unknown>).id}-${(position.symbol as Record<string, unknown>)?.id || 'unknown'}`,
            account_id: (accountHolding.account as Record<string, unknown>).id as string,
            security_id: (position.symbol as Record<string, unknown>)?.id || 'unknown',
            institution_value: positionValue,
            institution_price: Number(position.price) || 0,
            institution_price_as_of: new Date().toISOString(),
            cost_basis: costBasis,
            quantity: Number(position.units) || 0,
            iso_currency_code: (position.currency as Record<string, unknown>)?.code || 'USD',
            security_name: ((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.description || ((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.symbol || 'Unknown Security',
            security_type: (((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.type as Record<string, unknown>)?.description || 'Bond',
            ticker_symbol: ((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.symbol || 'Unknown',
            name: ((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.description || ((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.symbol || 'Unknown Security',
            type: (((position.symbol as Record<string, unknown>)?.symbol as Record<string, unknown>)?.type as Record<string, unknown>)?.description || 'Bond',
            value: positionValue,
            // SnapTrade specific fields
            snapTradeData: {
              open_pnl: position.open_pnl,
              average_purchase_price: position.average_purchase_price,
              account_name: (accountHolding.account as Record<string, unknown>).name as string,
              account_number: (accountHolding.account as Record<string, unknown>).number as string,
            }
          });
        });
      }

      // Handle accounts with only cash (no positions)
      if (accountHolding.balances && Array.isArray(accountHolding.balances) && accountHolding.balances.length > 0) {
        const cashBalance = (accountHolding.balances as Record<string, unknown>[]).find((b: Record<string, unknown>) => (b.currency as Record<string, unknown>)?.code === 'USD');
        if (cashBalance && Number(cashBalance.cash) > 0) {
          console.log('Adding cash balance:', cashBalance.cash);
          holdings.push({
            id: `${(accountHolding.account as Record<string, unknown>).id}-cash`,
            account_id: (accountHolding.account as Record<string, unknown>).id as string,
            security_id: 'cash',
            institution_value: Number(cashBalance.cash),
            institution_price: 1,
            institution_price_as_of: new Date().toISOString(),
            cost_basis: Number(cashBalance.cash),
            quantity: Number(cashBalance.cash),
            iso_currency_code: 'USD',
            security_name: 'Cash',
            security_type: 'Cash',
            ticker_symbol: 'CASH',
            name: 'Cash',
            type: 'Cash',
            value: Number(cashBalance.cash),
            snapTradeData: {
              account_name: (accountHolding.account as Record<string, unknown>).name as string,
              account_number: (accountHolding.account as Record<string, unknown>).number as string,
            }
          });
        }
      }

      return holdings;
    }) : [];

    // Combine Plaid and SnapTrade holdings
    const combinedHoldings = [
      ...(plaidData?.holdings || []),
      ...snapTradeHoldingsFormatted
    ];

    // Calculate combined portfolio metrics
    console.log('Combined holdings:', combinedHoldings.length);
    console.log('Sample holding:', combinedHoldings[0]);

    const totalValue = combinedHoldings.reduce((sum, holding) => {
      const holdingValue = holding.institution_value || holding.value || 0;
      console.log(`Holding ${holding.security_name || holding.name || 'Unknown'}: value = ${holdingValue}`);
      return sum + holdingValue;
    }, 0);
    const holdingCount = combinedHoldings.length;
    const securityCount = new Set(combinedHoldings.map(h => h.security_id)).size;

    console.log('Calculated metrics:', { totalValue, holdingCount, securityCount });

    // Group by security type for asset allocation. Types are normalized first so
    // the same asset class from different providers ("etf" from Plaid, "ETF" from
    // SnapTrade) collapses into a single bucket.
    const assetAllocationMap = new Map<string, number>();
    combinedHoldings.forEach(holding => {
      const type = normalizeAssetType(holding.security_type || holding.type);
      const value = holding.institution_value || holding.value || 0;
      assetAllocationMap.set(type, (assetAllocationMap.get(type) || 0) + value);
    });

    const assetAllocation = Array.from(assetAllocationMap.entries()).map(([type, value]) => ({
      type,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
    }));

    // Convert SnapTrade activities to the format expected by InvestmentPortfolio
    console.log('Processing SnapTrade activities:', activities);
    const snapTradeActivitiesFormatted = activities ? activities.map((activity: Record<string, unknown>) => ({
      id: activity.id as string,
      account_id: (activity.account_name as string) || 'snaptrade',
      security_id: ((activity.symbol as Record<string, unknown>)?.id as string) || 'unknown',
      amount: Number(activity.amount) || 0,
      date: (activity.trade_date as string) || new Date().toISOString(),
      name: ((activity.symbol as Record<string, unknown>)?.description as string) || ((activity.symbol as Record<string, unknown>)?.symbol as string) || 'Unknown Security',
      quantity: Number(activity.units) || 0,
      price: Number(activity.price) || 0,
      fees: Number(activity.fee) || 0,
      type: (activity.type as string) || 'Unknown',
      iso_currency_code: ((activity.currency as Record<string, unknown>)?.code as string) || 'USD',
      institution_value: Number(activity.amount) || 0,
      institution_price: Number(activity.price) || 0,
      institution_price_as_of: (activity.trade_date as string) || new Date().toISOString(),
      cost_basis: (Number(activity.price) || 0) * (Number(activity.units) || 0),
      security_name: ((activity.symbol as Record<string, unknown>)?.description as string) || ((activity.symbol as Record<string, unknown>)?.symbol as string) || 'Unknown Security',
      security_type: (((activity.symbol as Record<string, unknown>)?.type as Record<string, unknown>)?.description as string) || 'Unknown',
      ticker_symbol: ((activity.symbol as Record<string, unknown>)?.symbol as string) || 'Unknown',
      value: Number(activity.amount) || 0,
      // SnapTrade specific fields
      snapTradeData: {
        activity_type: activity.type as string,
        description: activity.description as string,
        trade_date: activity.trade_date as string,
        settlement_date: activity.settlement_date as string,
        fee: activity.fee as number,
        account_name: activity.account_name as string,
        account_number: activity.account_number as string,
        institution: activity.institution as string
      }
    })) : [];

    // Combine Plaid and SnapTrade transactions
    const combinedTransactions = [
      ...(plaidData?.investment_transactions || []),
      ...snapTradeActivitiesFormatted
    ];

    console.log('Final portfolio data being set:', {
      portfolio: { totalValue, assetAllocation, holdingCount, securityCount },
      holdingsCount: combinedHoldings.length,
      transactionsCount: combinedTransactions.length
    });

    // Calculate transaction metrics
    const totalTransactions = combinedTransactions.length;
    const totalVolume = combinedTransactions.reduce((sum, tx) => sum + Math.abs(tx.institution_value || tx.value || 0), 0);
    const averageTransactionSize = totalTransactions > 0 ? totalVolume / totalTransactions : 0;

    // Group transactions by type. Types are normalized first: Plaid sends
    // lowercase types ("buy") and SnapTrade uppercase activity types ("BUY"),
    // which would otherwise count as two separate kinds of activity.
    const activityByType: Record<string, number> = {};
    combinedTransactions.forEach(tx => {
      const type = normalizeLabel((tx.snapTradeData?.activity_type as string) || tx.type);
      activityByType[type] = (activityByType[type] || 0) + 1;
    });

    return {
      portfolio: {
        totalValue,
        assetAllocation,
        holdingCount,
        securityCount
      },
      holdings: combinedHoldings,
      transactions: combinedTransactions,
      // Additional fields for SnapTrade integration
      investment_transactions: combinedTransactions,
      total_investment_transactions: totalTransactions,
      securities: plaidData?.securities || [],
      accounts: plaidData?.accounts || [],
      item: plaidData?.item,
      analysis: {
        portfolio: {
          totalValue,
          assetAllocation,
          holdingCount,
          securityCount
        },
        activity: {
          totalTransactions,
          totalVolume,
          activityByType,
          averageTransactionSize
        }
      }
    };
  }, []);

  // NEW: Load enhanced investment data from summaries endpoint
  const loadInvestmentData = useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Load from single-source snapshot (full view so we can show holdings/transactions)
      const summaryRes = await fetch(`${API_URL}/api/summaries?view=full`, {
        method: 'GET',
        headers,
      });

      if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          console.log('Received summary data:', summaryData);

          // Use portfolio and holdings directly from snapshot
          const portfolioData = summaryData.investmentPortfolio || {};
          const holdings = Array.isArray(summaryData.holdings) ? summaryData.holdings : [];
          // Use 'activities' for investment transactions, not 'transactions' (which includes banking transactions)
          const investmentTransactions = Array.isArray(summaryData.activities) ? summaryData.activities : [];
          type SnapshotTx = {
            institution_value?: number;
            value?: number;
            amount?: number;
          };
          const formattedData = {
            portfolio: {
              ...portfolioData
            },
            holdings,
            transactions: investmentTransactions, // Use activities (investment transactions only)
            investment_transactions: investmentTransactions,
            total_investment_transactions: investmentTransactions.length,
            securities: [],
            accounts: [],
            item: {},
            analysis: {
              portfolio: {
                ...portfolioData
              },
              activity: {
                totalTransactions: investmentTransactions.length,
                totalVolume: investmentTransactions.reduce((sum: number, tx: SnapshotTx) => {
                  const v = Math.abs(
                    (tx.institution_value ?? tx.value ?? tx.amount ?? 0)
                  );
                  return sum + (Number.isFinite(v) ? v : 0);
                }, 0),
                activityByType: {},
                averageTransactionSize: investmentTransactions.length > 0
                  ? investmentTransactions.reduce((sum: number, tx: SnapshotTx) => {
                      const v = Math.abs(
                        (tx.institution_value ?? tx.value ?? tx.amount ?? 0)
                      );
                      return sum + (Number.isFinite(v) ? v : 0);
                    }, 0) / investmentTransactions.length
                  : 0
              }
            }
          };

          setInvestmentData(formattedData);

          console.log('Investment portfolio loaded from summary:', {
            totalValue: portfolioData.totalValue,
            holdingsCount: portfolioData.holdingsCount,
            securityCount: portfolioData.securityCount,
            holdingsLoaded: holdings.length,
            transactionsLoaded: investmentTransactions.length
          });
        return;
      }

      // Fallback to the legacy authenticated endpoint if summary loading fails.
      const investmentsRes = await fetch(`${API_URL}/plaid/investments`, {
        method: 'GET',
        headers,
      });

      if (investmentsRes.ok) {
        const investmentsData = await investmentsRes.json();
        console.log('Received investment data (Plaid + SnapTrade merged):', investmentsData);

        // Transform backend data format to match frontend expectations
        const formattedData = {
          portfolio: investmentsData.portfolio,
          holdings: investmentsData.holdings || [],
          transactions: investmentsData.transactions || [],
          investment_transactions: investmentsData.transactions || [],
          total_investment_transactions: investmentsData.transactions?.length || 0,
          securities: [], // Securities info is embedded in holdings
          accounts: [], // Account info is embedded in holdings
          item: {},
          analysis: {
            portfolio: investmentsData.portfolio,
            activity: {
              totalTransactions: investmentsData.transactions?.length || 0,
              totalVolume: 0,
              activityByType: {},
              averageTransactionSize: 0
            }
          }
        };

        setInvestmentData(formattedData);

        console.log('Investment data loaded (fallback):', {
          totalValue: formattedData.portfolio?.totalValue,
          holdingCount: formattedData.portfolio?.holdingCount,
          securityCount: formattedData.portfolio?.securityCount,
          holdingsLength: formattedData.holdings?.length
        });
      } else {
        console.log('Failed to load investment data:', investmentsRes.status);
        setInvestmentData(null);
      }
    } catch (err) {
      console.error('Error loading investment data:', err);
      // Don't set error here as this is optional data
    }
  }, [API_URL]);

  // Function to refresh all data after successful Plaid connection with retry logic
  const refreshAllData = useCallback(async (isRetry = false, currentRetryCount = 0) => {
      try {
        // Show retry message if this is a retry attempt
        if (isRetry) {
          setRetryMessage(`Trying to get your transaction history (attempt ${currentRetryCount + 1}/5)...`);
        } else {
          setRetryMessage('Getting your transaction history...');
        }

        // Load accounts and investment data
        await loadConnectedAccounts();
        await loadInvestmentData();

        await Promise.all([
          loadTokenStatuses(),
          loadSnapTradeStatus()
        ]);

        // A new or re-linked bank changes the institution list, so re-read it
        // rather than leaving a row that no longer matches.
        setPlaidConnectionsKey(key => key + 1);

        // Try to refresh transaction history
        if (transactionHistoryRef.current?.refresh) {
          try {
            await transactionHistoryRef.current.refresh();
            // Success! Clear retry state
            setRetryCount(0);
            setIsRetrying(false);
            setRetryMessage('Data refreshed successfully!');
            // Clear success message after 3 seconds
            setTimeout(() => setRetryMessage(''), 3000);
          } catch (error) {
            console.log('Transaction refresh failed:', error);
            // Check if it's a PRODUCT_NOT_READY error
            if (error instanceof Error && (
                error.message.includes('PRODUCT_NOT_READY') ||
                error.message.includes('not yet ready'))) {
              // Handle retry inline to avoid circular dependency
              if (currentRetryCount < 4) { // Max 5 attempts (0-4)
                const newRetryCount = currentRetryCount + 1;
                setRetryCount(newRetryCount);
                setIsRetrying(true);

                // Exponential backoff: 10s, 20s, 40s, 80s
                const delay = Math.pow(2, newRetryCount) * 10000;

                console.log(`Scheduling retry ${newRetryCount + 1}/5 in ${delay/1000} seconds...`);

                setTimeout(() => {
                  refreshAllData(true, newRetryCount);
                }, delay);
              } else {
                // Max retries reached
                setIsRetrying(false);
                setRetryMessage('⏰ Data is still processing. Please check back in a few minutes or refresh manually.');
                setTimeout(() => setRetryMessage(''), 10000);
              }
            } else {
              // Other error, don't retry
              setRetryMessage('❌ Failed to refresh transactions. Please try again later.');
              setTimeout(() => setRetryMessage(''), 5000);
            }
          }
        }
      } catch (error) {
        console.error('Error in refreshAllData:', error);
        // Check if it's a PRODUCT_NOT_READY error
        if (error instanceof Error && (
            error.message.includes('PRODUCT_NOT_READY') ||
            error.message.includes('not yet ready'))) {
          // Handle retry inline to avoid circular dependency
          if (currentRetryCount < 4) { // Max 5 attempts (0-4)
            const newRetryCount = currentRetryCount + 1;
            setRetryCount(newRetryCount);
            setIsRetrying(true);

            // Exponential backoff: 10s, 20s, 40s, 80s
            const delay = Math.pow(2, newRetryCount) * 10000;

            console.log(`Scheduling retry ${newRetryCount + 1}/5 in ${delay/1000} seconds...`);

            setTimeout(() => {
              refreshAllData(true, newRetryCount);
            }, delay);
          } else {
            // Max retries reached
            setIsRetrying(false);
            setRetryMessage('⏰ Data is still processing. Please check back in a few minutes or refresh manually.');
            setTimeout(() => setRetryMessage(''), 10000);
          }
        } else {
          setRetryMessage('❌ Failed to refresh data. Please try again later.');
          setTimeout(() => setRetryMessage(''), 5000);
        }
      }
  }, [loadConnectedAccounts, loadInvestmentData, loadTokenStatuses, loadSnapTradeStatus]);

  // Signed-out visitors get sent to sign in and come back here afterwards, so a
  // deep link into this page (an emailed "connect your accounts" link, say)
  // survives the detour instead of rendering an empty page with no way forward.
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      // `replace`, so the back button does not land them here to bounce again.
      router.replace(loginUrlFor(destination));
    }
  }, [router]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);

    // The add-accounts deep link opens the institution picker on arrival. Keep
    // the param in the URL until auto-connect consumes it below — stripping on
    // read would lose the intent across a React Strict Mode remount (and would
    // drop it from the signed-out auth redirect's returnTo if this effect won
    // the race).
    if (urlParams.get(CONNECT_INTENT_PARAM) === CONNECT_ACCOUNTS_INTENT) {
      setWantsToAddAccount(true);
    }

    // Check for subscription-related URL parameters
    const subscriptionParam = urlParams.get('subscription');
    if (subscriptionParam) {
      switch (subscriptionParam) {
        case 'updated':
          setSubscriptionMessage('✅ Your subscription has been updated successfully!');
          break;
        case 'canceled':
          setSubscriptionMessage('ℹ️ Your subscription has been canceled. You can still access your data.');
          break;
        case 'active':
          setSubscriptionMessage('✅ Your subscription is now active!');
          break;
        case 'trialing':
          setSubscriptionMessage('✅ Your free 1-month trial has started!');
          break;
      }
      // Clear the message after 5 seconds
      setTimeout(() => setSubscriptionMessage(''), 5000);
    }

    loadConnectedAccounts();
    loadInvestmentData();
    loadManualAccounts();
  }, [loadConnectedAccounts, loadInvestmentData, loadManualAccounts]);

  // Fetch user email, subscription status, and connection statuses.
  useEffect(() => {
    const fetchUserData = async () => {
        try {
          const token = localStorage.getItem('auth_token');
          if (token) {
            // Fetch user email
            const userRes = await fetch(`${API_URL}/auth/verify`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            if (userRes.ok) {
              const userData = await userRes.json();
              setUserEmail(userData.user.email);
            }

            // Fetch subscription status, token statuses, and SnapTrade status
            await Promise.all([
              loadSubscriptionStatus(),
              loadTokenStatuses(),
              loadSnapTradeStatus()
            ]);
          }
        } catch (error) {
          console.error('Failed to fetch user data:', error);
        }
    };

    fetchUserData();
  }, [API_URL, loadSubscriptionStatus, loadTokenStatuses, loadSnapTradeStatus]);

  // Log localStorage flag changes for debugging
  useEffect(() => {
    const checkFlag = () => {
      const flag = localStorage.getItem(CONNECT_ACCOUNTS_STORAGE_KEY);
      console.log(`localStorage ${CONNECT_ACCOUNTS_STORAGE_KEY} flag:`, flag);
    };

    // Check on mount
    checkFlag();

    // Check when storage changes
    window.addEventListener('storage', checkFlag);

    return () => window.removeEventListener('storage', checkFlag);
  }, []);

  // Open the institution picker for a visitor who arrived asking to add
  // accounts, rather than dropping them into one provider's flow: the deep link
  // is followed most often from an empty Finances page, by someone who has no
  // way to know whether their institution is a bank or an investment
  // connection.
  useEffect(() => {
    if (loading || autoConnectTriggeredRef.current) return;

    // The intent arrives either as the deep link's query param or as the legacy
    // in-tab flag, still honored for navigations already in flight.
    const wantsToConnectAccounts =
      wantsToAddAccount || localStorage.getItem(CONNECT_ACCOUNTS_STORAGE_KEY) === 'true';
    if (!wantsToConnectAccounts) return;

    // Consume the intent from every source so nothing re-triggers once the
    // picker has been asked to open. Strip the param here (not on read) so a
    // refresh after open does not reopen, while a remount before open can still
    // see it.
    autoConnectTriggeredRef.current = true;
    localStorage.removeItem(CONNECT_ACCOUNTS_STORAGE_KEY);
    setWantsToAddAccount(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has(CONNECT_INTENT_PARAM)) {
      url.searchParams.delete(CONNECT_INTENT_PARAM);
      window.history.replaceState({}, '', url.toString());
    }

    addAccountButtonRef.current?.open();
  }, [loading, wantsToAddAccount]);

  /**
   * Open Plaid Link after the shared picker routed an institution here.
   *
   * Plaid has no general institution pre-selection -- `institution_id` on a link
   * token is documented for Europe-only and legacy configurations -- so Link
   * still opens on its own picker and the user names the bank once more there.
   * What the picker bought is the routing: nobody had to work out that their
   * bank is one integration and their brokerage another.
   *
   * `null` is the "browse all banks" escape hatch for a search that found
   * nothing, since Plaid's own directory is larger than a name search surfaces.
   */
  const handleConnectPlaid = useCallback((institution: InstitutionOption | null) => {
    console.log(
      'Opening Plaid Link',
      institution ? `after selecting ${institution.name}` : '(browse all)'
    );
    // Clear the module-level guard the way `forceReinitialize` would, but
    // without the remount it causes: remounting swaps the ref out from under
    // the call being made on the next line.
    resetPlaidLinkInitialization();
    // forceNew: this same PlaidLinkButton may be holding an ITEM_LOGIN_REQUIRED
    // updateModeTokenId for the reconnect button. Adding an account must not
    // open Link in update mode for that broken Item.
    plaidLinkButtonRef.current?.createLinkToken({ forceNew: true });
  }, []);

  /** Open the SnapTrade portal already on the brokerage the picker selected. */
  const handleConnectSnapTrade = useCallback((institution: InstitutionOption) => {
    snapTradeButtonRef.current?.connect(institution.providerInstitutionId);
  }, []);

  const formatLastSeen = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
  };

  const closedAccountCount = connectedAccounts.filter(account => account.isClosed).length;

  /**
   * Every account, from both providers, as one list.
   *
   * Two sections split by provider made the user's own accounts look like two
   * unrelated things, and the split was ours -- which integration reads the
   * institution -- not theirs. One list sorted by institution puts a bank and a
   * brokerage at the same firm next to each other, which is how someone
   * actually thinks about their money.
   *
   * Health stays strictly per provider. A Plaid Item at Fidelity says nothing
   * about a SnapTrade authorization at Fidelity: matching either one's trouble
   * to the other by institution name would paint a working connection broken.
   * So the Plaid rows read `tokenStatuses` only, and the brokerage rows go
   * through `snapTradeAccountHealth` only.
   */
  const unifiedAccounts = useMemo(() => {
    const rows: Array<{ key: string; institution: string; name: string; closed: boolean; card: AccountCardProps }> = [];

    for (const account of connectedAccounts) {
      // This list is Plaid-only (`/plaid/all-accounts` filters out SnapTrade).
      // Never match SnapTrade's disabled connections by institution name here --
      // a disabled SnapTrade Fidelity link would otherwise paint a healthy Plaid
      // Fidelity Item as broken.
      const tokenStatus = tokenStatuses.find(t => t.institutionName === account.institution);
      const isClosed = Boolean(account.isClosed);
      const lastSeen = formatLastSeen(account.lastSeenAt);
      const balance = resolveAccountBalance(account);

      rows.push({
        key: `plaid:${account.id}`,
        institution: account.institution || '',
        name: account.name,
        closed: isClosed,
        card: {
          name: account.name,
          badge: isClosed ? 'Closed' : null,
          badgeTitle: 'This account is no longer reported by the institution',
          // A closed account's connection health is not the story; whether it
          // still counts toward the totals is, and the note below says so.
          health: tokenStatus && !isClosed
            ? {
                ok: tokenStatus.isActive,
                title: tokenStatus.isActive
                  ? 'Connection active'
                  : `Connection issue: ${tokenStatus.lastError || 'Unknown error'}`,
              }
            : null,
          detail: `${account.institution ? `${account.institution} • ` : ''}${account.type} • ${account.subtype}`,
          note: isClosed
            ? `Closed — not included in your Finances totals${lastSeen ? ` • Last reported ${lastSeen}` : ''}`
            : null,
          issue: tokenStatus && !isClosed && !tokenStatus.isActive && tokenStatus.lastError
            ? (tokenStatus.lastError === 'ITEM_LOGIN_REQUIRED'
              ? 'Re-authentication required'
              : tokenStatus.lastError)
            : null,
          // Same rule as the Finances page: current is authoritative, available
          // is only a fallback. Preferring available for depository accounts
          // reported holds instead of the balance and disagreed with the totals.
          balance,
          balanceFallback: '—',
          balanceNote: isClosed && balance !== null ? 'Last known balance' : null,
          dimmed: isClosed,
        },
      });
    }

    for (const account of snapTradeAccounts) {
      const { isHealthy, isDirect, issue } = snapTradeAccountHealth(account, snapTradeStatus);
      rows.push({
        key: `snaptrade:${account.id}`,
        institution: account.institution || '',
        name: account.name,
        closed: false,
        card: {
          name: account.name,
          health: {
            ok: isHealthy,
            title: isHealthy
              ? (isDirect ? 'Read directly from Public' : 'Connection active')
              : `Connection issue: ${issue || 'Unknown error'}`,
          },
          detail: `${account.institution ? `${account.institution} • ` : ''}${account.type}${account.subtype ? ` • ${account.subtype}` : ''}`,
          issue,
          balance: account.balance,
          balanceFallback: 'Not reported',
          balanceFallbackTitle: 'This provider did not report a balance for this account.',
          balanceNote: account.balanceDerivedFromPositions ? 'from positions' : null,
          balanceNoteTitle: "Summed from this account's positions; any uninvested cash is not included.",
        },
      });
    }

    // Closed accounts stay in the list for reference but sit below the ones that
    // still count toward the Finances totals.
    return rows.sort((a, b) => {
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      const byInstitution = a.institution.localeCompare(b.institution);
      if (byInstitution !== 0) return byInstitution;
      return a.name.localeCompare(b.name);
    });
  }, [connectedAccounts, tokenStatuses, snapTradeAccounts, snapTradeStatus]);

  /** Plaid Items with no accounts left to hang their failure on. */
  const orphanedTokens = tokenStatuses.filter(
    token => !connectedAccounts.some(account => account.institution === token.institutionName)
  );

  const handleDisconnectAccounts = async () => {
    setIsDeleting(true);
    setDeleteMessage('');

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Disconnect Plaid accounts
      const plaidResponse = await fetch(`${API_URL}/privacy/disconnect-accounts`, {
        method: 'POST',
        headers,
      });
      const plaidData = await plaidResponse.json().catch(() => ({}));

      // Disconnect SnapTrade accounts
      const snapTradeResponse = await fetch(`${API_URL}/snaptrade/delete`, {
        method: 'DELETE',
        headers,
      });

      if (plaidResponse.ok && snapTradeResponse.ok) {
        // Privacy disconnect returns success:false when some Items refused to
        // revoke and were kept for retry — HTTP 200 alone would claim a full wipe.
        setDeleteMessage(
          plaidData.success === false
            ? (plaidData.message || 'Some bank connections could not be revoked at Plaid and were kept so you can try again. Other accounts were disconnected.')
            : 'All your accounts (Plaid and SnapTrade) have been successfully disconnected.'
        );
      } else if (plaidResponse.ok) {
        setDeleteMessage(
          plaidData.success === false
            ? (plaidData.message || 'Some bank connections could not be revoked at Plaid and were kept so you can try again.')
            : 'All your financial accounts have been disconnected.'
        );
      } else if (snapTradeResponse.ok) {
        setDeleteMessage('Your SnapTrade accounts have been disconnected. Some Plaid accounts may still be connected.');
      } else {
        setDeleteMessage(plaidData.error || 'Failed to disconnect some accounts. Please try again.');
      }

      // Per-institution lists are independent of loadConnectedAccounts; bump both
      // so a partial disconnect does not leave stale rows on the page. The Public
      // direct panel must refresh too: disconnect-accounts destroys the stored
      // secret, and leaving it on "Connected" would lie about a tradeable key.
      setPlaidConnectionsKey(key => key + 1);
      setSnapTradeConnectionsKey(key => key + 1);
      setPublicDirectKey(key => key + 1);
      loadConnectedAccounts();
    } catch (_error) {
      setDeleteMessage('An error occurred while disconnecting your accounts. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllData = async () => {
    setIsDeleting(true);
    setDeleteMessage('');

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Delete Plaid data
      const plaidResponse = await fetch(`${API_URL}/privacy/delete-all-data`, {
        method: 'DELETE',
        headers,
      });

      // Delete SnapTrade data
      const snapTradeResponse = await fetch(`${API_URL}/snaptrade/delete`, {
        method: 'DELETE',
        headers,
      });

      if (plaidResponse.ok && snapTradeResponse.ok) {
        setDeleteMessage('All your data (Plaid and SnapTrade) has been successfully deleted.');
        localStorage.removeItem('auth_token');
        // Redirect to home page after successful deletion
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else if (plaidResponse.ok) {
        setDeleteMessage('Your Plaid data has been deleted. Some SnapTrade data may still exist.');
      } else if (snapTradeResponse.ok) {
        setDeleteMessage('Your SnapTrade data has been deleted. Some Plaid data may still exist.');
      } else {
        setDeleteMessage('Failed to delete some data. Please try again or contact support.');
      }
    } catch (_error) {
      setDeleteMessage('An error occurred while deleting your data. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Accounts & Personal Context | Ask Linc"
        description="Manage connected accounts and the personal details Linc remembers for future financial decisions."
      />
      <div className="authenticated-site min-h-screen">
        <AuthenticatedPageHeader
          activePage="profile"
          eyebrow="Accounts & context"
          title="Your accounts & context"
          email={userEmail}
          homeHref="/app"
          onLogout={() => {
            resetPlaidLinkInitialization();
            localStorage.removeItem('auth_token');
            window.location.href = '/login';
          }}
        />

        <main className="mx-auto max-w-[1200px] p-5 py-10 sm:px-6 md:py-12">
          <div className="authenticated-intro mb-10"><h2>Keep your financial context current.</h2><p>Manage the accounts and household details that ground every Ask Linc answer.</p></div>
          {/* Remembered Personal Context Section */}
          <UserProfile userId={userEmail ? 'user' : undefined} />

          {/* One entry point for both providers.
              Two provider-labelled "Connect Account" buttons asked the user
              which integration covers their bank, which is our plumbing and not
              a question they can answer. This asks for the institution instead
              and opens whichever connection actually supports it. */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-2">Add an account</h2>
            <p className="text-sm text-gray-400 mb-4">
              Search for your bank or brokerage and we&apos;ll open the connection that supports it.
            </p>
            <AddAccountButton
              ref={addAccountButtonRef}
              onSelectPlaid={handleConnectPlaid}
              onSelectSnapTrade={handleConnectSnapTrade}
              snapTradeReady={snapTradeReady}
            />
            {/* Both provider flows report progress and failure after this modal
                has closed, so the message is surfaced here rather than beside a
                hidden button further down the page. */}
            {(plaidLinkStatus || snapTradeConnectStatus) && (
              <div className="mt-3 rounded bg-gray-700 px-3 py-2 text-sm text-gray-300">
                {plaidLinkStatus || snapTradeConnectStatus}
              </div>
            )}
          </div>

          {/* Every connected account, in one list.
              Splitting these into a Plaid section and a SnapTrade section made
              a user's own accounts look like two unrelated things, over a
              distinction that is ours and not theirs. Health is still derived
              strictly per provider -- see `unifiedAccounts` -- because that is
              the part the two integrations genuinely do not share. */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Your connected accounts</h2>

            {/* Repair controls. Both components are headless: "Add an account"
                above owns connecting, and each renders a button only while one
                of its connections needs re-authenticating, which is a repair of
                a named connection rather than adding an account. They still
                mount because the whole provider lifecycle lives inside them, and
                the shared flow drives them through their refs. */}
            <div className="mb-6 space-y-3">
              <PlaidLinkButton
                onSuccess={() => {
                  // Refresh all data when an account is successfully linked
                  console.log('Account linked, refreshing all data');
                  refreshAllData();
                }}
                onStatusChange={setPlaidLinkStatus}
                updateModeTokenId={tokenStatuses.find(t => t.lastError === 'ITEM_LOGIN_REQUIRED')?.id}
                headless={!tokenStatuses.some(t => t.lastError === 'ITEM_LOGIN_REQUIRED')}
                label="Reconnect account"
                ref={plaidLinkButtonRef}
              />

              <SnapTradeButton
                ref={snapTradeButtonRef}
                headless
                onReadyChange={setSnapTradeReady}
                onAccountsLoaded={setSnapTradeAccounts}
                onConnectStatus={setSnapTradeConnectStatus}
                snapTradeStatus={snapTradeStatus}
                // Repairs a disabled authorization rather than adding a second
                // connection to the same brokerage. Undefined when nothing is
                // broken, which leaves the ordinary connect flow untouched.
                // One portal trip repairs one authorization, so this offers the
                // first; refreshing status after it shortens the list and the
                // next becomes first.
                reconnectAuthorizationId={snapTradeStatus?.reconnectAuthorizationIds?.[0]}
                onAccountsUpdated={() => {
                  // Refresh investment data when SnapTrade accounts are updated.
                  // Also re-read token health so reconnectAuthorizationIds drops
                  // the authorization just repaired (or advances to the next
                  // disabled one) instead of leaving the button stuck on a stale id.
                  loadInvestmentData();
                  void loadSnapTradeStatus();
                  // A new or repaired connection changes the institution list, so
                  // re-read it rather than leaving a row that no longer matches.
                  setSnapTradeConnectionsKey(key => key + 1);
                  // Linking Public (or repairing it) can flip direct-connection
                  // eligibility once the snapshot catches up; re-check the panel.
                  setPublicDirectKey(key => key + 1);
                }}
              />

              {/* Retry Status Messages */}
              {retryMessage && (
                <div className={`p-3 rounded-lg text-sm ${
                  retryMessage.includes('✅')
                    ? 'bg-green-900/20 border border-green-700 text-green-300'
                    : retryMessage.includes('❌')
                    ? 'bg-red-900/20 border border-red-700 text-red-300'
                    : retryMessage.includes('⏰')
                    ? 'bg-yellow-900/20 border border-yellow-700 text-yellow-300'
                    : 'bg-blue-900/20 border border-blue-700 text-blue-300'
                }`}>
                  {retryMessage}
                </div>
              )}

              {/* Retry Progress Indicator */}
              {isRetrying && (
                <div className="p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-300 text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-300"></div>
                    <span>Waiting for data to be ready... (Retry {retryCount + 1}/5)</span>
                  </div>
                </div>
              )}
            </div>

            {/* The combined account list */}
            <div>
              {loading ? (
                <div className="text-gray-400">Loading accounts...</div>
              ) : error ? (
                <div className="text-gray-400">{error}</div>
              ) : unifiedAccounts.length === 0 && orphanedTokens.length === 0 ? (
                <div className="text-gray-400 text-sm">
                  No accounts connected yet. Use &ldquo;Add an account&rdquo; above to connect your first one.
                </div>
              ) : (
                <div className="space-y-3">
                  {closedAccountCount > 0 && (
                    <div className="text-xs text-gray-400 mb-1">
                      {closedAccountCount === 1
                        ? '1 account is closed and is not included in your Finances totals.'
                        : `${closedAccountCount} accounts are closed and are not included in your Finances totals.`}
                    </div>
                  )}

                  {unifiedAccounts.map(row => (
                    <AccountCard key={row.key} {...row.card} />
                  ))}

                  {/* Plaid Items whose accounts are all gone: the failure has no
                      account card left to sit on, so it gets its own row rather
                      than disappearing with them. */}
                  {orphanedTokens.map(token => (
                    <div
                      key={token.id}
                      className="bg-gray-800/50 rounded-lg p-4 border-2 border-red-500/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="min-w-0 break-words font-medium text-white">{token.institutionName || 'Unknown Institution'}</div>
                            <span className="text-red-400" title={`Connection issue: ${token.lastError || 'Unknown error'}`}>
                              ✗
                            </span>
                          </div>
                          <div className="text-sm text-gray-400 mt-1">
                            No accounts available
                          </div>
                          <div className="text-xs text-red-400 mt-1">
                            {token.lastError === 'ITEM_LOGIN_REQUIRED' ?
                              'Re-authentication required - Click "Reconnect account" above to reconnect' :
                              token.lastError ? token.lastError :
                              !token.isActive ? 'Connection inactive' :
                              'No accounts available for this connection'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Status: {token.isActive ? 'Active' : 'Inactive'} •
                            Last checked: {token.lastChecked ? new Date(token.lastChecked).toLocaleString() : 'Never'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* A whole-user SnapTrade failure with no account cards to show
                      it on. LOGIN_REQUIRED is deliberately not orphaned: those
                      accounts still render above with per-authorization
                      attribution, and the reconnect control is at the top. */}
                  {snapTradeStatus?.connected
                    && (snapTradeStatus?.status === 'error' || snapTradeStatus?.status === 'ERROR') && (
                    <div className="bg-gray-800/50 rounded-lg p-4 border-2 border-red-500/30">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className="font-medium text-white">Investment connection</div>
                        <span className="text-red-400" title={`Connection issue: ${snapTradeStatus.error || 'Unknown error'}`}>
                          ✗
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        No investment accounts available
                      </div>
                      <div className="text-xs text-red-400 mt-1">
                        {snapTradeStatus.error || 'Connection issue - Click "Reconnect Account" above to reconnect'}
                      </div>
                      {snapTradeStatus.lastChecked && (
                        <div className="text-xs text-gray-500 mt-1">
                          Last checked: {new Date(snapTradeStatus.lastChecked).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Manage connections: one row per institution for each provider, so
                a single bad link can be removed without taking every other
                connection down with it. Two components because the disconnect
                paths genuinely differ (an Item must be revoked at Plaid; an
                authorization must be removed at SnapTrade), but they read as one
                list under one heading. */}
            <div className="mt-6 border-t border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Manage connections</h3>
              <div className="space-y-3">
                <PlaidConnections
                  refreshKey={plaidConnectionsKey}
                  onConnectionRemoved={async () => {
                    // The disconnect already revoked the Item, removed the rows and
                    // queued a rebuild; these re-reads are what make the page stop
                    // showing the institution.
                    await Promise.all([
                      loadConnectedAccounts(),
                      loadTokenStatuses(),
                      loadInvestmentData(),
                    ]);
                  }}
                />

                <SnapTradeConnections
                  refreshKey={snapTradeConnectionsKey}
                  onConnectionRemoved={async () => {
                    // The disconnect already removed the rows and queued a rebuild;
                    // these re-reads are what make the page stop showing them.
                    await Promise.all([
                      loadConnectedAccounts(),
                      loadInvestmentData(),
                      loadSnapTradeStatus(),
                    ]);
                    // Removing the Public brokerage link changes whether the direct
                    // connection is on offer at all.
                    setPublicDirectKey(key => key + 1);
                  }}
                />

                {/* Renders nothing unless the user already has Public via SnapTrade.
                    A stopgap for Public's managed-yield accounts, which SnapTrade
                    cannot sync. */}
                <PublicDirectConnection
                  refreshKey={publicDirectKey}
                  onChanged={async () => {
                    await Promise.all([
                      loadConnectedAccounts(),
                      loadInvestmentData(),
                    ]);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Manual Accounts Section */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Manual Accounts</h2>
            <ManualAccountList
              accounts={manualAccounts}
              onRefresh={loadManualAccounts}
            />
          </div>

          {/* NEW: Enhanced Investment Portfolio Section */}
          {investmentData && (
            <div className="mb-6">
              <InvestmentPortfolio
                portfolio={{
                  totalValue: investmentData.analysis?.portfolio?.totalValue || 0,
                  assetAllocation: investmentData.analysis?.portfolio?.assetAllocation || [],
                  holdingCount: investmentData.analysis?.portfolio?.holdingCount || 0,
                  securityCount: investmentData.analysis?.portfolio?.securityCount || 0
                }}
                holdings={investmentData.holdings || []}
                transactions={investmentData.investment_transactions || []}
              />
            </div>
          )}

          {/* Transaction History - Show ALL transactions */}
          <div className="mb-6">
            <TransactionHistory ref={transactionHistoryRef} />
          </div>

          {/* Subscription Management Section */}
          <div className="mb-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Subscription Management</h2>

                {/* Subscription Message */}
                {subscriptionMessage && (
                  <div className="mb-4 p-3 bg-green-900/20 border border-green-700 rounded-lg">
                    <div className="text-sm text-green-400">
                      {subscriptionMessage}
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-medium text-white mb-2">Current Plan</h3>
                      <p className="text-gray-400 text-sm">
                        Manage your subscription, update payment methods, and view billing history
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <button
                        onClick={handleManageSubscription}
                        disabled={isManagingSubscription}
                        className="w-full rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:bg-blue-800 sm:w-auto"
                        title="Open Stripe customer portal"
                      >
                        {isManagingSubscription ? 'Opening...' : 'Manage Subscription'}
                      </button>
                      <div className="text-xs text-gray-400 mt-1">
                        Opens Stripe customer portal
                      </div>
                    </div>
                  </div>

                  {subscriptionStatus ? (
                    <div className="border border-gray-600 rounded-lg p-4 bg-gray-700">
                      <div className="mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-300">Status</span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            subscriptionStatus.stripeCustomerId && ['active', 'trialing'].includes(subscriptionStatus.status || '')
                              ? 'bg-green-600 text-white'
                              : subscriptionStatus.accessLevel === 'full'
                              ? 'bg-blue-600 text-white'
                              : 'bg-yellow-600 text-white'
                          }`}>
                            {subscriptionStatus.stripeCustomerId && ['active', 'trialing'].includes(subscriptionStatus.status || '')
                              ? subscriptionStatus.status === 'trialing' ? 'Free Trial' : 'Active Subscription'
                              : subscriptionStatus.accessLevel === 'full'
                              ? 'Admin Access'
                              : subscriptionStatus.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-400">
                        Plan: {subscriptionStatus.tier} • Access: {subscriptionStatus.accessLevel}
                      </div>
                      {!subscriptionStatus.stripeCustomerId && (
                        <div className="mt-2 text-xs text-blue-400">
                          No active subscription found. You can still access the customer portal to view billing options.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border border-gray-600 rounded-lg p-4 bg-gray-700">
                      <div className="text-sm text-gray-400">
                        Loading subscription status...
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {error && (
                    <div className="border border-red-600 rounded-lg p-4 bg-red-900/20">
                      <div className="text-sm text-red-400">
                        ⚠️ {error}
                      </div>
                    </div>
                  )}
                </div>
              </div>
          </div>

          {/* Account Settings */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Account Settings</h2>
            <div className="space-y-6">
              <div>
                <p className="text-gray-400 text-sm mb-4">
                  Your financial data is read-only and never stored permanently.
                </p>

                <div className="space-y-4">
                  <div className="border border-gray-600 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Disconnect Your Accounts</h4>
                    <p className="text-gray-400 text-sm mb-3">
                      Remove all Plaid and SnapTrade connections and clear your financial data.
                      This will disconnect all linked financial accounts but keep your conversation history.
                    </p>
                    <button
                      onClick={handleDisconnectAccounts}
                      disabled={isDeleting}
                      className="bg-slate-600 hover:bg-slate-700 disabled:bg-slate-800 px-4 py-2 rounded text-sm transition-colors"
                    >
                      {isDeleting ? 'Disconnecting...' : 'Disconnect All Accounts'}
                    </button>
                  </div>

                  <div className="border border-gray-600 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Delete All Your Data</h4>
                    <p className="text-gray-400 text-sm mb-3">
                      Permanently delete all your data including accounts, transactions,
                      conversations, and Plaid and SnapTrade connections. This action cannot be undone.
                    </p>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isDeleting}
                      className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800 px-4 py-2 rounded text-sm transition-colors"
                    >
                      Delete All Data
                    </button>
                  </div>
                </div>

                {deleteMessage && (
                  <div className={`mt-4 p-3 rounded-lg ${
                    deleteMessage.includes('successfully')
                      ? 'bg-green-900 border border-green-700 text-green-200'
                      : 'bg-red-900 border border-red-700 text-red-200'
                  }`}>
                    {deleteMessage}
                  </div>
                )}
              </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-6 w-6 text-red-400">⚠️</div>
                    <h3 className="text-lg font-semibold">Confirm Data Deletion</h3>
                  </div>
                  <p className="text-gray-300 mb-4">
                    This action will permanently delete all your data including:
                  </p>
                  <ul className="text-sm text-gray-400 mb-4 space-y-1">
                    <li>• All connected accounts (Plaid)</li>
                    <li>• All connected accounts (SnapTrade)</li>
                    <li>• Transaction history</li>
                    <li>• Conversation history</li>
                    <li>• Account balances and sync data</li>
                    <li>• What Linc remembers about you</li>
                  </ul>
                  <p className="text-sm text-red-400 mb-4 font-medium">
                    This action cannot be undone.
                  </p>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row">
                    <button
                      onClick={handleDeleteAllData}
                      disabled={isDeleting}
                      className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800 px-4 py-2 rounded text-sm transition-colors flex-1"
                    >
                      {isDeleting ? 'Deleting...' : 'Yes, Delete Everything'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-sm transition-colors flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
