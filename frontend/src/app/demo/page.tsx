import type { Metadata } from 'next';
import DemoPageClient from './DemoPageClient';

export const metadata: Metadata = {
  title: 'Experience Ask Linc Demo | AI Financial Analysis Platform',
  description: 'Experience the power of Ask Linc firsthand with our interactive demo. Test our AI financial analysis tools using realistic sample data and see how we can help improve your money management.',
  keywords: ['Ask Linc demo', 'financial analysis demo', 'AI finance demo', 'try Ask Linc', 'financial platform demo'],
  alternates: {
    canonical: 'https://asklinc.com/demo',
  },
  openGraph: {
    title: 'Experience Ask Linc Demo | AI Financial Analysis Platform',
    description: 'Experience the power of Ask Linc firsthand with our interactive demo.',
    type: 'website',
    url: 'https://asklinc.com/demo',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ask Linc Demo - AI Financial Analysis Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Experience Ask Linc Demo | AI Financial Analysis Platform',
    description: 'Experience the power of Ask Linc firsthand with our interactive demo.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function DemoPage() {
  return <DemoPageClient />;
} 