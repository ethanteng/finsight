"use client";
import { useState, useEffect } from 'react';
import PlaidLinkButton from '../../components/PlaidLinkButton';
import DataSyncButtons from '../../components/DataSyncButtons';

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
  currentBalance: number;
}

export default function ProfilePage() {
  const [connectedAccounts, setConnectedAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Load connected accounts
  const loadConnectedAccounts = async () => {
    setLoading(true);
    setError('');
    
    try {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        setConnectedAccounts([]);
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/plaid/accounts?access_token=${accessToken}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        setConnectedAccounts(data.accounts || []);
      } else {
        const errorData = await res.json();
        if (errorData.error === 'Invalid access token' || errorData.error === 'INVALID_ACCESS_TOKEN') {
          setConnectedAccounts([]);
          setError('No accounts connected. Please connect an account first.');
        } else {
          setError('Failed to load accounts');
        }
      }
    } catch (err) {
      setError('Error loading accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnectedAccounts();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <a 
            href="/app" 
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm transition-colors"
          >
            Back to App
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Account Management Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Connected Accounts</h2>
          
          {/* Connect New Account */}
          <div className="mb-6">
            <PlaidLinkButton />
          </div>

          {/* Sync Data */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3">Sync Data</h3>
            <DataSyncButtons />
          </div>

          {/* Connected Accounts List */}
          <div>
            <h3 className="text-lg font-medium mb-3">Your Connected Accounts</h3>
            
            {loading ? (
              <div className="text-gray-400">Loading accounts...</div>
            ) : error ? (
              <div className="text-gray-400">
                {error}
              </div>
            ) : connectedAccounts.length === 0 ? (
              <div className="text-gray-400">
                No accounts connected yet. Use the button above to connect your first account.
              </div>
            ) : (
              <div className="space-y-3">
                {connectedAccounts.map((account) => (
                  <div 
                    key={account.id} 
                    className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-white">{account.name}</div>
                        <div className="text-sm text-gray-400">
                          {account.type} • {account.subtype}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-white">
                          {formatCurrency(account.currentBalance)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Account Settings */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Account Settings</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-2">Data Privacy</h3>
              <p className="text-gray-400 text-sm">
                Your financial data is read-only and never stored permanently. 
                We use Plaid's secure API to access your accounts.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Disconnect Accounts</h3>
              <p className="text-gray-400 text-sm">
                To disconnect an account, you'll need to revoke access through your bank's website 
                or contact your financial institution directly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 