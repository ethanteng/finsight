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

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    loadPrivacyData();
  }, []);

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
        
        setMessage({ text: 'All data deleted successfully. Redirecting to app...', type: 'success' });
        await loadPrivacyData(); // Refresh data
        
        // Redirect to app after a short delay
        setTimeout(() => {
          window.location.href = '/app';
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
              href="/app" 
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Back to App
            </a>
            <a 
              href="/profile" 
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Profile
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-medium mb-2">Connected Accounts</h3>
                <p className="text-3xl font-bold text-blue-400">{privacyData.accounts}</p>
                <p className="text-sm text-gray-400">Linked financial accounts</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-medium mb-2">Transactions</h3>
                <p className="text-3xl font-bold text-green-400">{privacyData.transactions}</p>
                <p className="text-sm text-gray-400">Recent financial transactions</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-medium mb-2">Conversations</h3>
                <p className="text-3xl font-bold text-purple-400">{privacyData.conversations}</p>
                <p className="text-sm text-gray-400">AI conversation history</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-medium mb-2">Last Sync</h3>
                <p className="text-sm text-gray-400">
                  {privacyData.lastSync ? formatDate(privacyData.lastSync.lastSync) : 'Never'}
                </p>
                {privacyData.lastSync && (
                  <p className="text-xs text-gray-500">
                    {privacyData.lastSync.accountsSynced} accounts, {privacyData.lastSync.transactionsSynced} transactions
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-400">No data available</div>
          )}
        </div>

        {/* Privacy Controls */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Data Controls</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
              <div>
                <h3 className="font-medium">Disconnect All Accounts</h3>
                <p className="text-sm text-gray-400">
                  Remove all Plaid connections and clear financial data
                </p>
              </div>
              <button
                onClick={handleDisconnectAccounts}
                disabled={actionLoading}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 px-4 py-2 rounded text-sm transition-colors"
              >
                {actionLoading ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
              <div>
                <h3 className="font-medium">Delete All Data</h3>
                <p className="text-sm text-gray-400">
                  Permanently delete all your data including conversations
                </p>
              </div>
              <button
                onClick={handleDeleteAllData}
                disabled={actionLoading}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 px-4 py-2 rounded text-sm transition-colors"
              >
                {actionLoading ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>

        {/* Privacy Information */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">How We Protect Your Privacy</h2>
          
          <div className="space-y-4 text-sm">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium">Data Anonymization</h3>
                <p className="text-gray-400">
                  All sensitive data (account names, institutions, merchant names) is anonymized before being sent to AI for analysis.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium">Read-Only Access</h3>
                <p className="text-gray-400">
                  We only have read-only access to your financial data. We cannot move your money or make any transactions.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium">Secure Plaid Integration</h3>
                <p className="text-gray-400">
                  We use Plaid&apos;s secure API, the same technology used by major banks and financial institutions.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium">No AI Training</h3>
                <p className="text-gray-400">
                  Your data is not used to train AI models. We use OpenAI&apos;s API which does not train on your data.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium">Complete Control</h3>
                <p className="text-gray-400">
                  You can delete all your data or disconnect accounts at any time with one click.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* What We Can See */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">What We Can and Cannot See</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-green-400 mb-3">✅ We Can See</h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li>• Account balances and types</li>
                <li>• Transaction amounts and dates</li>
                <li>• Transaction categories</li>
                <li>• Your questions and our answers</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-medium text-red-400 mb-3">❌ We Cannot See</h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li>• Your login credentials</li>
                <li>• Account numbers or routing numbers</li>
                <li>• Your personal information</li>
                <li>• Make any transactions</li>
                <li>• Access your money</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 