import type { Metadata } from 'next';
import PrivacyContent from '../../components/PrivacyContent';

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
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return <PrivacyContent />;
} 