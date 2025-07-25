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
    <div style={{ minHeight: '100vh', background: '#181c20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#23272f', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.25)', padding: 40, minWidth: 350, maxWidth: 420, width: '100%' }}>
        <h1 style={{ fontWeight: 700, fontSize: 28, marginBottom: 24, textAlign: 'center' }}>
          Finsight
        </h1>
        <PlaidLinkButton />
        <DataSyncButtons />
        <FinanceQA />
      </div>
    </div>
  );
} 