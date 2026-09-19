import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Compare Financial Planning Tools & Show the Math | Ask Linc',
  description:
    'Compare Ask Linc with ChatGPT, Origin, PortfolioPilot, Monarch, and Boldin. See how Show the Math makes your financial plan’s inputs and calculations inspectable.',
  alternates: {
    canonical: 'https://asklinc.com/vs',
  },
  openGraph: {
    title: 'Compare Financial Planning Tools & Show the Math',
    description:
      'Explore Show the Math: inputs, assumptions, calculations, checks, and sources alongside your financial answer. Compare Ask Linc with other planning tools.',
    type: 'website',
    url: 'https://asklinc.com/vs',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Compare Ask Linc with other financial tools' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Compare Financial Planning Tools & Show the Math',
    description: 'Compare financial tools and see how Ask Linc’s Show the Math helps you inspect the answer.',
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
