import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Financial Insights & Market Analysis | Ask Linc Blog',
  description: 'Field notes on Coast FIRE, retirement decisions, self-directed planning, financial models, and product transparency.',
  alternates: { canonical: 'https://asklinc.com/blog' },
  openGraph: {
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Field notes on Coast FIRE, retirement decisions, self-directed planning, financial models, and product transparency.',
    type: 'website',
    url: 'https://asklinc.com/blog',
    siteName: 'Ask Linc',
    images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Ask Linc financial planning blog' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Field notes on Coast FIRE, retirement decisions, self-directed planning, financial models, and product transparency.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: { index: true, follow: true },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
