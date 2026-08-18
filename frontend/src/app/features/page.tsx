import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'How Ask Linc Works — Connected Data and Clear Math',
  description: 'See how Ask Linc combines connected accounts with portfolio, property, economic, market, and historical data to answer financial questions with inspectable math.',
  keywords: ['financial data integrations', 'AI financial tools', 'connected financial accounts', 'financial analysis tools', 'investment data'],
  alternates: {
    canonical: 'https://asklinc.com/features',
  },
  openGraph: {
    title: 'How Ask Linc Works — Connected Data and Clear Math',
    description: 'See how Ask Linc combines connected accounts with portfolio, property, economic, market, and historical data to answer financial questions with inspectable math.',
    type: 'website',
    url: 'https://asklinc.com/features',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'How Ask Linc uses connected accounts and clear calculations',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How Ask Linc Works — Connected Data and Clear Math',
    description: 'See how Ask Linc combines connected accounts with portfolio, property, economic, market, and historical data to answer financial questions with inspectable math.',
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
  return <MarketingSubpage params={Promise.resolve({ slug: ['features'] })} />;
}
