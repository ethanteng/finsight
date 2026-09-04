import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Financial Insights & Market Analysis | Ask Linc Blog',
  description: 'Field notes on intelligent finance, retirement decisions, product transparency, and trustworthy financial AI.',
  alternates: { canonical: 'https://asklinc.com/blog' },
  openGraph: {
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Field notes on intelligent finance, retirement decisions, product transparency, and trustworthy financial AI.',
    type: 'website',
    url: 'https://asklinc.com/blog',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Ask Linc financial planning blog' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Field notes on intelligent finance, retirement decisions, product transparency, and trustworthy financial AI.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: { index: true, follow: true },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
