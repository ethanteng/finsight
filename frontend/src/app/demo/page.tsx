import type { Metadata } from 'next';
import DemoPageClient from './DemoPageClient';

export const metadata: Metadata = {
  title: 'Ask Linc | AI Financial Analysis Platform',
  description: 'Ask Linc helps households plan retirement, evaluate major purchases, and stress-test financial decisions with answers grounded in real accounts and live market context.',
  keywords: ['Ask Linc', 'AI financial analysis', 'retirement planning', 'financial reasoning', 'personal finance AI'],
  alternates: {
    canonical: 'https://asklinc.com/demo',
  },
  openGraph: {
    title: 'Ask Linc | AI Financial Analysis Platform',
    description: 'Decision-ready financial answers grounded in your accounts and live market context.',
    type: 'website',
    url: 'https://asklinc.com/demo',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ask Linc - AI Financial Analysis Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ask Linc | AI Financial Analysis Platform',
    description: 'Decision-ready financial answers grounded in your accounts and live market context.',
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