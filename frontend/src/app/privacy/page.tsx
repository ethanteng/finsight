import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Privacy Policy | How Ask Linc Protects Your Financial Data',
  description: 'Learn how Ask Linc protects your privacy and financial data. Our comprehensive privacy policy explains data collection, encryption, user rights, and security measures.',
  keywords: ['privacy policy', 'data protection', 'financial data security', 'privacy', 'data encryption'],
  alternates: {
    canonical: 'https://asklinc.com/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | How Ask Linc Protects Your Financial Data',
    description: 'Learn how Ask Linc protects your privacy and financial data.',
    type: 'website',
    url: 'https://asklinc.com/privacy',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Ask Linc privacy policy' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy | How Ask Linc Protects Your Financial Data',
    description: 'Learn how Ask Linc protects your privacy and financial data.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['privacy'] })} />;
}
