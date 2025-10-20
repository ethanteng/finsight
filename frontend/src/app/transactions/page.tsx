"use client";

import React, { useEffect, useState } from 'react';
import { CategoryComparison } from '@/components/transactions/CategoryComparison';

export default function TransactionsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get user ID from token or auth context
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Decode JWT to get user ID (simple implementation)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserId(payload.userId || payload.sub);
      } catch (error) {
        console.error('Error decoding token:', error);
      }
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Authentication Required</h1>
          <p className="text-gray-400 mb-6">Please log in to view your transactions.</p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Transaction Analysis</h1>
          <p className="text-gray-400">
            Compare how Plaid and our AI categorize your transactions. Select transactions to get AI categorizations.
          </p>
        </div>
        
        <CategoryComparison userId={userId} />
      </div>
    </div>
  );
}

