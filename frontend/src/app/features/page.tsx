import type { Metadata } from 'next';
import FeaturesPage from '../../components/FeaturesPage';

export const metadata: Metadata = {
  title: 'Features — Ask Linc Financial Reasoning',
  description: 'Explore how Ask Linc blends your financial data and market context to deliver meaningful, decision-ready answers.',
  openGraph: {
    title: 'Features — Ask Linc Financial Reasoning',
    description: 'Explore how Ask Linc blends your financial data and market context to deliver meaningful, decision-ready answers.',
    type: 'website',
    url: 'https://asklinc.com/features',
    siteName: 'Ask Linc',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features — Ask Linc Financial Reasoning',
    description: 'Explore how Ask Linc blends your financial data and market context to deliver meaningful, decision-ready answers.',
  },
};

export default function FeaturesPageRoute() {
  return <FeaturesPage />;
}
