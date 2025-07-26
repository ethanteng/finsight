"use client";
import PlaidLinkButton from '../../components/PlaidLinkButton';
import DataSyncButtons from '../../components/DataSyncButtons';
import FinanceQA from '../../components/FinanceQA';
import { useState } from 'react';

// Dummy linked accounts for demo; replace with real data from backend if available
const useLinkedAccounts = () => {
  const [accounts] = useState([
    { name: 'Chase Checking', type: 'checking', mask: '1234' },
    { name: 'Amex Credit', type: 'credit', mask: '5678' },
  ]);
  // TODO: Fetch from backend
  return accounts;
};

export default function AppPage() {
  const accounts = useLinkedAccounts();

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">Linc</h1>
          <p className="text-gray-300">Your AI Financial Analyst</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Account Connection Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Connected Accounts</h2>
          {accounts.length > 0 ? (
            <div className="space-y-2">
              {accounts.map((account, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-gray-700 rounded">
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <span className="text-sm">{account.name} •••• {account.mask}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No accounts connected yet</p>
          )}
          <div className="mt-4">
            <PlaidLinkButton />
          </div>
          <div className="mt-2">
            <DataSyncButtons />
          </div>
        </div>

        {/* Main Q&A Section */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Ask About Your Finances</h2>
          <FinanceQA />
        </div>
      </div>
    </div>
  );
} 