import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Compare Self-Directed Financial Planning Tools | Ask Linc',
  description:
    'Compare Ask Linc with ChatGPT, Origin, PortfolioPilot, Monarch, and Boldin by modeling effort, planning scope, scenarios, and the job each tool does.',
  alternates: {
    canonical: 'https://asklinc.com/vs',
  },
  openGraph: {
    title: 'Compare Self-Directed Financial Planning Tools',
    description:
      'See how Ask Linc differs from ChatGPT, all-in-one money apps, budget trackers, investment tools, and retirement planners.',
    type: 'website',
    url: 'https://asklinc.com/vs',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Compare Ask Linc with other financial tools' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Compare Self-Directed Financial Planning Tools',
    description: 'Compare financial tools by the job each product is built to do.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function CompareIndexRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['vs'] })} />;
}
