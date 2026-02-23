import type { Metadata } from 'next';
import FaqContent from '../../components/FaqContent';

export const metadata: Metadata = {
  title: 'FAQ | Frequently Asked Questions | Ask Linc',
  description: 'Common questions about Ask Linc: budget tracking, pricing, data security, market data, and more. Get answers to your questions about our AI financial platform.',
  keywords: ['FAQ', 'frequently asked questions', 'Ask Linc', 'financial AI', 'budget app'],
  alternates: {
    canonical: 'https://asklinc.com/faq',
  },
  openGraph: {
    title: 'FAQ | Frequently Asked Questions | Ask Linc',
    description: 'Common questions about Ask Linc. Get answers about our AI financial platform.',
    type: 'website',
    url: 'https://asklinc.com/faq',
    siteName: 'Ask Linc',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function FaqPage() {
  return <FaqContent />;
}
