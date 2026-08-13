import type { Metadata } from 'next';
import DemoPageClient from './DemoPageClient';

export const metadata: Metadata = {
  title: 'Try Ask Linc With Fictional Accounts',
  description: 'Try questions about a home, family costs, career changes, investments, and retirement using fictional accounts.',
  keywords: ['Ask Linc', 'AI financial analysis', 'retirement planning', 'financial reasoning', 'personal finance AI'],
  alternates: {
    canonical: 'https://asklinc.com/demo',
  },
  openGraph: {
    title: 'Try Ask Linc With Fictional Accounts',
    description: 'See how Ask Linc works through a big financial decision using fictional accounts.',
    type: 'website',
    url: 'https://asklinc.com/demo',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ask Linc demo using fictional financial accounts',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Try Ask Linc With Fictional Accounts',
    description: 'See how Ask Linc works through a big financial decision using fictional accounts.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function DemoPage() {
  return <DemoPageClient />;
}
