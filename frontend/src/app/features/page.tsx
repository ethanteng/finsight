import type { Metadata } from 'next';
import FeaturesPage from '../../components/FeaturesPage';

export const metadata: Metadata = {
  title: 'Features — Ask Linc Financial Reasoning',
  description: 'Explore how Ask Linc blends your financial data and market context to deliver meaningful, decision-ready answers.',
  keywords: ['financial features', 'AI financial tools', 'money management features', 'financial analysis tools', 'investment features'],
  alternates: {
    canonical: 'https://asklinc.com/features',
  },
  openGraph: {
    title: 'Features — Ask Linc Financial Reasoning',
    description: 'Explore how Ask Linc blends your financial data and market context to deliver meaningful, decision-ready answers.',
    type: 'website',
    url: 'https://asklinc.com/features',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ask Linc Features - Financial Reasoning Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features — Ask Linc Financial Reasoning',
    description: 'Explore how Ask Linc blends your financial data and market context to deliver meaningful, decision-ready answers.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function FeaturesPageRoute() {
  return <FeaturesPage />;
}
