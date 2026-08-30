import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'About | Ask Linc — Founded by Ethan Teng',
  description:
    'Why Ethan Teng built Ask Linc to help people plan a home, family, career change, and retirement using their real accounts and math they can check.',
  alternates: {
    canonical: 'https://asklinc.com/about',
  },
  openGraph: {
    title: 'About | Ask Linc',
    description:
      'Why Ethan Teng built Ask Linc to make big financial decisions easier to check before you act.',
    type: 'website',
    url: 'https://asklinc.com/about',
    siteName: 'Ask Linc',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function AboutPage() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['about'] })} />;
}
