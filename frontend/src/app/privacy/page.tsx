"use client";
import { useState, useEffect, useCallback } from 'react';

interface PrivacyData {
  accounts: number;
  transactions: number;
  conversations: number;
  lastSync: {
    lastSync: string;
    accountsSynced: number;
    transactionsSynced: number;
  } | null;
}

export default function PrivacyPage() {
  const [privacyData, setPrivacyData] = useState<PrivacyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const loadPrivacyData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/privacy/data`);
      if (res.ok) {
        const data = await res.json();
        setPrivacyData(data);
      }
    } catch {
      console.error('Error loading privacy data');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    // Check if user came from demo page
    const referrer = document.referrer;
    const urlParams = new URLSearchParams(window.location.search);
    const isFromDemo = referrer.includes('/demo') || window.location.pathname.includes('demo') || urlParams.get('demo') === 'true';
    setIsDemo(isFromDemo);
    
    loadPrivacyData();
  }, [loadPrivacyData]);

  const handleDisconnectAccounts = async () => {
    if (!confirm('This will disconnect all your linked accounts and clear all financial data. This action cannot be undone. Are you sure?')) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/privacy/disconnect-accounts`, {
        method: 'POST',
      });

      if (res.ok) {
        // Clear localStorage prompt history since accounts are disconnected
        localStorage.removeItem('linc_prompt_history');
        
        setMessage({ text: 'All accounts disconnected and data cleared successfully.', type: 'success' });
        await loadPrivacyData(); // Refresh data
      } else {
        setMessage({ text: 'Failed to disconnect accounts. Please try again.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Error disconnecting accounts. Please try again.', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAllData = async () => {
    if (!confirm('This will permanently delete ALL your data including conversations, accounts, and transactions. This action cannot be undone. Are you sure?')) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/privacy/delete-all`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Clear localStorage prompt history
        localStorage.removeItem('linc_prompt_history');
        
        setMessage({ text: 'All data deleted successfully. Redirecting...', type: 'success' });
        await loadPrivacyData(); // Refresh data
        
        // Redirect based on context
        setTimeout(() => {
          window.location.href = isDemo ? '/demo' : '/app';
        }, 2000);
      } else {
        setMessage({ text: 'Failed to delete data. Please try again.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Error deleting data. Please try again.', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Privacy & Data Control</h1>
          <div className="flex items-center space-x-3">
            <a 
              href={isDemo ? "/demo" : "/app"}
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Back to App
            </a>
            <a 
              href={isDemo ? "/profile?demo=true" : "/profile"}
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Profile
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Notification */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            {message.text}
          </div>
        )}

        {/* Data Summary */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Your Data Summary</h2>
          {loading ? (
            <div className="text-gray-400">Loading...</div>
          ) : privacyData ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-700 p-4 rounded">
                <div className="text-2xl font-bold text-blue-400">{privacyData.accounts}</div>
                <div className="text-sm text-gray-400">Connected Accounts</div>
              </div>
              <div className="bg-gray-700 p-4 rounded">
                <div className="text-2xl font-bold text-green-400">{privacyData.transactions}</div>
                <div className="text-sm text-gray-400">Transactions</div>
              </div>
              <div className="bg-gray-700 p-4 rounded">
                <div className="text-2xl font-bold text-purple-400">{privacyData.conversations}</div>
                <div className="text-sm text-gray-400">Conversations</div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400">No data available</div>
          )}
        </div>

        {/* Last Sync Info */}
        {privacyData?.lastSync && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-3">Last Data Sync</h3>
            <div className="text-sm text-gray-300">
              <p>Last updated: {formatDate(privacyData.lastSync.lastSync)}</p>
              <p>Accounts synced: {privacyData.lastSync.accountsSynced}</p>
              <p>Transactions synced: {privacyData.lastSync.transactionsSynced}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-3 text-red-400">Disconnect All Accounts</h3>
            <p className="text-gray-300 mb-4">
              This will disconnect all your linked bank accounts and clear all financial data. 
              You can always reconnect accounts later.
            </p>
            <button
              onClick={handleDisconnectAccounts}
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
            >
              {actionLoading ? 'Disconnecting...' : 'Disconnect All Accounts'}
            </button>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-3 text-red-600">Delete All Data</h3>
            <p className="text-gray-300 mb-4">
              This will permanently delete ALL your data including conversations, accounts, and transactions. 
              This action cannot be undone.
            </p>
            <button
              onClick={handleDeleteAllData}
              disabled={actionLoading}
              className="bg-red-800 hover:bg-red-900 disabled:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
            >
              {actionLoading ? 'Deleting...' : 'Delete All Data'}
            </button>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="mt-8 p-6 bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-3">Privacy Notice</h3>
          <div className="text-sm text-gray-300 space-y-2">
            <p>
              • Your financial data is encrypted and stored securely
            </p>
            <p>
              • We never share your personal information with third parties
            </p>
            <p>
              • You can export or delete your data at any time
            </p>
            <p>
              • We use Plaid to securely connect to your bank accounts
            </p>
            <p>
              • Your data is used only to provide personalized financial insights
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 