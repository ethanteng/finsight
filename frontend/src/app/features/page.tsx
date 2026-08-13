import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'How Ask Linc Works — Accounts, What-Ifs, and Clear Math',
  description: 'Connect your accounts, ask a plain-language question, compare what-if scenarios, and inspect the assumptions and calculations.',
  keywords: ['financial features', 'AI financial tools', 'money management features', 'financial analysis tools', 'investment features'],
  alternates: {
    canonical: 'https://asklinc.com/features',
  },
  openGraph: {
    title: 'How Ask Linc Works — Accounts, What-Ifs, and Clear Math',
    description: 'Connect your accounts, ask a plain-language question, compare what-if scenarios, and inspect the assumptions and calculations.',
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
    title: 'How Ask Linc Works — Accounts, What-Ifs, and Clear Math',
    description: 'Connect your accounts, ask a plain-language question, compare what-if scenarios, and inspect the assumptions and calculations.',
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
