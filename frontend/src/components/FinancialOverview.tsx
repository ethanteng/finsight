"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
  balance: {
    current: number;
    available: number;
    limit?: number;
    iso_currency_code: string;
  };
}

interface SnapTradeAccount {
  id: string;
  name: string;
  type: string;
  institution: string;
  balance: number;
  accountNumber: string;
  syncStatus: string;
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
}

interface FinancialOverviewProps {
  isDemo?: boolean;
}

export default function FinancialOverview({ isDemo = false }: FinancialOverviewProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapTradeAccounts, setSnapTradeAccounts] = useState<SnapTradeAccount[]>([]);
  const [investmentData, setInvestmentData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        setLoading(true);
        setError('');

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (isDemo) {
          headers['x-demo-mode'] = 'true';
        } else {
          const token = localStorage.getItem('auth_token');
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          } else {
            // No token means user is not authenticated
            setLoading(false);
            return;
          }
        }

        // Load Plaid accounts
        const accountsRes = await fetch(`${API_URL}/plaid/all-accounts`, {
          headers,
        });

        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          setAccounts(accountsData.accounts || []);
        } else {
          console.error('Failed to load Plaid accounts:', accountsRes.status);
          // Set accounts to empty array if fetch fails
          setAccounts([]);
        }

        // Load SnapTrade accounts (only for authenticated users, not demo)
        if (!isDemo) {
          try {
            console.log('Fetching SnapTrade accounts...');
            const snapTradeRes = await fetch(`${API_URL}/snaptrade/accounts`, {
              headers,
            });

            console.log('SnapTrade response status:', snapTradeRes.status);
            if (snapTradeRes.ok) {
              const snapTradeData = await snapTradeRes.json();
              console.log('SnapTrade response data:', snapTradeData);
              if (snapTradeData.success && snapTradeData.data?.accounts) {
                setSnapTradeAccounts(snapTradeData.data.accounts);
                console.log('SnapTrade accounts loaded:', snapTradeData.data.accounts);
              } else {
                console.log('SnapTrade response not successful or no accounts:', snapTradeData);
              }
            } else {
              console.log('Failed to load SnapTrade accounts:', snapTradeRes.status);
              // Don't set error as this is optional
            }
          } catch (snapTradeError) {
            console.log('Error loading SnapTrade accounts:', snapTradeError);
            // Don't set error as this is optional
          }
        }

        // Load investment data
        const investmentsRes = await fetch(`${API_URL}/plaid/investments`, {
          headers,
        });

        if (investmentsRes.ok) {
          const investmentsData = await investmentsRes.json();
          setInvestmentData(investmentsData);
        } else {
          console.log('Failed to load investment data:', investmentsRes.status);
          // Don't set error as this is optional
        }
      } catch (error) {
        console.error('Error loading financial data:', error);
        setError('Failed to load financial data');
        // Set accounts to empty array on error
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [API_URL, isDemo]);

  // Calculate totals
  const calculateTotals = () => {
    let totalCash = 0;
    let totalDebt = 0;
    let totalInvestments = 0;
    let uncategorizedAccounts = 0;

    console.log('Calculating totals...');
    console.log('Plaid accounts:', accounts);
    console.log('SnapTrade accounts:', snapTradeAccounts);

    // Process Plaid accounts
    accounts.forEach(account => {
      // ✅ FIX: Use the correct balance field based on account type
      let balance;
      if (account.type === 'depository' || 
          account.subtype === 'checking' || 
          account.subtype === 'savings' || 
          account.subtype === 'cd' ||
          account.subtype === 'money market' ||
          account.subtype === 'prepaid') {
        // For checking/savings accounts, use available balance (what user can actually spend)
        balance = account.balance?.available !== undefined && account.balance?.available !== null 
          ? account.balance.available 
          : account.balance?.current || 0;
      } else if (account.type === 'investment' || 
                 account.subtype === '401k' || 
                 account.subtype === 'ira' || 
                 account.subtype === 'roth' || 
                 account.subtype === 'brokerage' || 
                 account.subtype === 'hsa' || 
                 account.subtype === '529' ||
                 account.subtype === 'pension' ||
                 account.subtype === 'annuity') {
        // For investment accounts, use current balance (total portfolio value)
        balance = account.balance?.current || 0;
      } else if (account.type === 'credit') {
        // For credit accounts, use current balance (amount owed)
        balance = account.balance?.current || 0;
      } else {
        // Fallback to current balance for other account types
        balance = account.balance?.current || 0;
      }
      
      const accountType = account.type;
      const accountSubtype = account.subtype;
      
      if (accountType === 'depository' || 
          accountSubtype === 'checking' || 
          accountSubtype === 'savings' || 
          accountSubtype === 'cd' ||
          accountSubtype === 'money market' ||
          accountSubtype === 'prepaid') {
        // Cash accounts: checking, savings, cd, money market, prepaid, etc.
        totalCash += Math.max(0, balance);
      } else if (accountType === 'credit') {
        // Credit cards - balance represents outstanding debt (positive = money owed)
        // Plaid may return positive or negative balances for credit cards
        // We want the absolute value as debt
        totalDebt += Math.abs(balance);
      } else if (accountType === 'loan' || 
                 accountSubtype === 'mortgage' || 
                 accountSubtype === 'student' || 
                 accountSubtype === 'personal' ||
                 accountSubtype === 'auto' ||
                 accountSubtype === 'home equity') {
        // Loans - positive balance means debt
        totalDebt += Math.max(0, balance);
      } else if (accountType === 'investment' || 
                 accountSubtype === '401k' || 
                 accountSubtype === 'ira' || 
                 accountSubtype === 'roth' || 
                 accountSubtype === 'brokerage' || 
                 accountSubtype === 'hsa' || 
                 accountSubtype === '529' ||
                 accountSubtype === 'pension' ||
                 accountSubtype === 'annuity') {
        // Investment accounts: 401k, IRA, Roth, brokerage, HSA, 529, pension, annuity, etc.
        totalInvestments += Math.max(0, balance);
      } else {
        // Fallback: categorize by balance sign
        // Positive balance could be cash or investment, negative could be debt
        if (balance > 0) {
          // Positive balance - treat as cash (conservative approach)
          totalCash += balance;
        } else if (balance < 0) {
          // Negative balance - treat as debt
          totalDebt += Math.abs(balance);
        }
        uncategorizedAccounts++;
      }
    });

    // Process SnapTrade accounts
    snapTradeAccounts.forEach(account => {
      // SnapTrade accounts have balance as a direct field, not nested like Plaid
      const balance = account.balance || 0;
      
      console.log('Processing SnapTrade account:', account.name, 'balance:', balance, 'type:', account.type);
      
      // SnapTrade accounts are typically investment accounts (brokerage, treasury, etc.)
      // Add them to total investments
      totalInvestments += Math.max(0, balance);
    });

    console.log('After processing SnapTrade accounts - totalInvestments:', totalInvestments);

    // Add investment portfolio value if available
    if (investmentData?.portfolio?.totalValue) {
      console.log('Investment data portfolio value:', investmentData.portfolio.totalValue);
      console.log('Calculated totalInvestments before override:', totalInvestments);
      
      // If we have SnapTrade accounts, use the sum of both
      // If no SnapTrade accounts, use the Plaid investment value
      if (snapTradeAccounts.length > 0) {
        console.log('SnapTrade accounts found - using sum of Plaid investment value and SnapTrade accounts');
        // Don't double-count - use the investment data value plus SnapTrade accounts
        const plaidInvestmentValue = investmentData.portfolio.totalValue;
        const snapTradeValue = snapTradeAccounts.reduce((sum, account) => sum + (account.balance || 0), 0);
        totalInvestments = plaidInvestmentValue + snapTradeValue;
        console.log('Combined total: Plaid investment value', plaidInvestmentValue, '+ SnapTrade value', snapTradeValue, '=', totalInvestments);
      } else {
        console.log('No SnapTrade accounts - using Plaid investment value as total');
        totalInvestments = investmentData.portfolio.totalValue;
      }
    }

    console.log('Final totals - totalCash:', totalCash, 'totalDebt:', totalDebt, 'totalInvestments:', totalInvestments);
    return { totalCash, totalDebt, totalInvestments, uncategorizedAccounts };
  };

  const { totalCash, totalDebt, totalInvestments, uncategorizedAccounts } = calculateTotals();
  const hasAccounts = accounts.length > 0 || snapTradeAccounts.length > 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleAddAccounts = () => {
    // Set a flag in localStorage to indicate user wants to connect accounts
    localStorage.setItem('wants_to_connect_accounts', 'true');
    router.push('/profile');
  };

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/3 mb-3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-16 bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasAccounts && !isDemo) {
    return (
      <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-blue-100 mb-2">
            Your Financial Overview
          </h3>
          <p className="text-blue-200 text-sm mb-4">
            Add your accounts to start seeing your financial overview
          </p>
          <button
            onClick={handleAddAccounts}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
          >
            Add Your Accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          <h3 className="text-lg font-semibold text-blue-100">Your Financial Overview</h3>
        </div>
        
        {/* Add More Accounts link - only show when user has accounts */}
        {hasAccounts && (
          <button
            onClick={handleAddAccounts}
            className="text-blue-300 hover:text-blue-200 text-sm transition-colors underline decoration-blue-400/30 hover:decoration-blue-400/60"
          >
            Add More Accounts
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-800 rounded p-3">
          <div className="text-blue-300 text-sm mb-1">Total Cash</div>
          <div className="text-white font-medium text-lg">
            {formatCurrency(totalCash)}
          </div>
        </div>
        
        <div className="bg-blue-800 rounded p-3">
          <div className="text-blue-300 text-sm mb-1">Total Debt</div>
          <div className="text-white font-medium text-lg">
            {formatCurrency(totalDebt)}
          </div>
        </div>
        
        <div className="bg-blue-800 rounded p-3">
          <div className="text-blue-300 text-sm mb-1">Total Investments</div>
          <div className="text-white font-medium text-lg">
            {formatCurrency(totalInvestments)}
          </div>
        </div>
      </div>

      {hasAccounts && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-blue-800 rounded p-2">
            <div className="text-blue-300">Accounts</div>
            <div className="text-white font-medium">{accounts.length + snapTradeAccounts.length}</div>
          </div>
          
          {investmentData?.portfolio && (
            <>
              <div className="bg-blue-800 rounded p-2">
                <div className="text-blue-300">Holdings</div>
                <div className="text-white font-medium">{investmentData.portfolio.holdingCount}</div>
              </div>
              <div className="bg-blue-800 rounded p-2">
                <div className="text-blue-300">Securities</div>
                <div className="text-white font-medium">{investmentData.portfolio.securityCount}</div>
              </div>
            </>
          )}
          
          <div className="bg-blue-800 rounded p-2">
            <div className="text-blue-300">Net Worth</div>
            <div className="text-white font-medium">
              {formatCurrency(totalCash + totalInvestments - totalDebt)}
            </div>
          </div>
          
          {/* Show uncategorized accounts count if any exist */}
          {uncategorizedAccounts > 0 && (
            <div className="bg-yellow-800 rounded p-2">
              <div className="text-yellow-300">Uncategorized</div>
              <div className="text-white font-medium">{uncategorizedAccounts}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
