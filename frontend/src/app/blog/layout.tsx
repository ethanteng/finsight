import type { Metadata } from 'next';
import { BuyMeACoffeeWidget } from '@/components/marketing/BuyMeACoffeeWidget';

export const metadata: Metadata = {
  title: 'Financial Insights & Market Analysis | Ask Linc Blog',
  description: 'Guides to Coast FIRE, retirement, and financial planning, plus a look at how Ask Linc works.',
  alternates: { canonical: 'https://asklinc.com/blog' },
  openGraph: {
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Guides to Coast FIRE, retirement, and financial planning, plus a look at how Ask Linc works.',
    type: 'website',
    url: 'https://asklinc.com/blog',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Ask Linc financial planning blog' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Guides to Coast FIRE, retirement, and financial planning, plus a look at how Ask Linc works.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: { index: true, follow: true },
};

// The layout holds the widget rather than each page, so it covers the index,
// every topic and every post, and stays put while a reader moves between them.
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BuyMeACoffeeWidget placement="blog" />
    </>
  );
}
