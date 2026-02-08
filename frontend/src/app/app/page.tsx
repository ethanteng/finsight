import type { Metadata } from 'next';
import AppPageClient from './AppPageClient';

export const metadata: Metadata = {
  title: 'Personal Financial Dashboard | Ask Linc - AI-Powered Money Management',
  description: 'Access your personal financial command center with Ask Linc. View real-time account balances, analyze spending patterns, and get AI-powered recommendations for your financial goals.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function AppPage() {
  return <AppPageClient />;
} 