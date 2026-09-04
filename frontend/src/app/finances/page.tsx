import type { Metadata } from 'next';
import FinancesPageClient from './FinancesPageClient';

export const metadata: Metadata = {
  title: 'My Finances HQ | Ask Linc - Complete Financial Overview',
  description: 'View your complete financial picture with current balances, portfolio value, trends over time, and detailed account information.',
  robots: { index: false, follow: false },
};

export default function FinancesPage() {
  return <FinancesPageClient />;
}
