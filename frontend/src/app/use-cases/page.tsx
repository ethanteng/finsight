import type { Metadata } from 'next';
import UseCasesPage from '../../components/UseCasesPage';

export const metadata: Metadata = {
  title: 'Use Cases — Ask Linc Financial Reasoning',
  description: 'Explore how Ask Linc helps with retirement planning, home buying, portfolio analysis, and market impact analysis.',
  keywords: ['financial use cases', 'retirement planning', 'home buying', 'portfolio analysis', 'market impact'],
  alternates: {
    canonical: 'https://asklinc.com/use-cases',
  },
  openGraph: {
    title: 'Use Cases — Ask Linc Financial Reasoning',
    description: 'Explore how Ask Linc helps with retirement planning, home buying, portfolio analysis, and market impact analysis.',
    type: 'website',
    url: 'https://asklinc.com/use-cases',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ask Linc Use Cases - Financial Reasoning Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Use Cases — Ask Linc Financial Reasoning',
    description: 'Explore how Ask Linc helps with retirement planning, home buying, portfolio analysis, and market impact analysis.',
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
  return <UseCasesPage />;
}
