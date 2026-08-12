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
  },
  robots: { index: true, follow: true },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
