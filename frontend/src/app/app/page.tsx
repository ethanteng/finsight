"use client";
import PlaidLinkButton from '../../components/PlaidLinkButton';
import DataSyncButtons from '../../components/DataSyncButtons';
import FinanceQA from '../../components/FinanceQA';

export default function AppPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Simplified Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-white">Linc</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Account Management - Simplified */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-center">
            <PlaidLinkButton />
            <DataSyncButtons />
          </div>
        </div>

        {/* Main Q&A Section - More Prominent */}
        <div className="bg-gray-800 rounded-lg p-6">
          <FinanceQA />
        </div>
      </div>
    </div>
  );
} 