import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Plan a Home, Family, Career, and Retirement — Ask Linc',
  description: 'See how Ask Linc helps people plan home buying, parental leave and childcare, investments, financial stress, and retirement.',
  keywords: ['financial planning', 'retirement planning', 'home buying', 'parental leave planning', 'childcare costs', 'portfolio analysis'],
  alternates: {
    canonical: 'https://asklinc.com/use-cases',
  },
  openGraph: {
    title: 'Plan a Home, Family, Career, and Retirement — Ask Linc',
    description: 'See how Ask Linc helps people plan home buying, parental leave and childcare, investments, financial stress, and retirement.',
    type: 'website',
    url: 'https://asklinc.com/use-cases',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ask Linc planning use cases for big life decisions',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Plan a Home, Family, Career, and Retirement — Ask Linc',
    description: 'See how Ask Linc helps people plan home buying, parental leave and childcare, investments, financial stress, and retirement.',
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

export default function UseCasesRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases'] })} />;
}
