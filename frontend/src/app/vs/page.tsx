import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Compare Ask Linc With Other Money Tools',
  description:
    'Compare Ask Linc with ChatGPT, Origin, PortfolioPilot, Monarch, and Boldin by the financial job each product is built to do.',
  alternates: {
    canonical: 'https://asklinc.com/vs',
  },
  openGraph: {
    title: 'Compare Ask Linc With Other Money Tools',
    description:
      'See how purpose-built financial decision software differs from general AI, broad money management, budgeting, portfolio analytics, and retirement planning.',
    type: 'website',
    url: 'https://asklinc.com/vs',
    siteName: 'Ask Linc',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function CompareIndexRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['vs'] })} />;
}
