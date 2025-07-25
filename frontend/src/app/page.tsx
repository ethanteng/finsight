"use client";
import PlaidLinkButton from '../components/PlaidLinkButton';
import DataSyncButtons from '../components/DataSyncButtons';
import FinanceQA from '../components/FinanceQA';

export default function Home() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#181c20',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <main
        style={{
          background: '#23272f',
          color: '#f3f6fa',
          padding: 32,
          borderRadius: 16,
          boxShadow: '0 4px 32px rgba(0,0,0,0.25)',
          minWidth: 350,
          maxWidth: 420,
          width: '100%',
        }}
      >
        <h1 style={{ fontWeight: 700, fontSize: 28, marginBottom: 24, textAlign: 'center' }}>
          Finsight
        </h1>
        <PlaidLinkButton />
        <DataSyncButtons />
        <FinanceQA />
      </main>
    </div>
  );
}
