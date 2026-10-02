import type { Metadata } from 'next';
import CashFlowPageClient from './CashFlowPageClient';

export const metadata: Metadata = {
  title: 'Cash Flow | Ask Linc',
  description: 'See your cash in and cash out over time, with a forecast built from your regular income, bills and planned events.',
  robots: { index: false, follow: false },
};

export default function CashFlowPage() {
  return <CashFlowPageClient />;
}
