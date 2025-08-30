import type { Metadata } from 'next';
import DemoPageClient from './DemoPageClient';

export const metadata: Metadata = {
  title: 'Experience Ask Linc Demo | AI Financial Analysis Platform',
  description: 'Experience the power of Ask Linc firsthand with our interactive demo. Test our AI financial analysis tools using realistic sample data and see how we can help improve your money management.',
};

export default function DemoPage() {
  return <DemoPageClient />;
} 