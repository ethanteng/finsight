import type { Metadata } from 'next';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Financial Insights & Market Analysis | Ask Linc Blog',
  description: 'Stay ahead of the financial curve with Ask Linc\'s expert blog. Get daily market analysis, investment strategies, economic insights, and personal finance tips from our financial experts.',
  keywords: ['financial blog', 'market analysis', 'investment strategies', 'economic insights', 'personal finance tips', 'financial news'],
  alternates: {
    canonical: 'https://asklinc.com/blog',
  },
  openGraph: {
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Stay ahead of the financial curve with Ask Linc\'s expert blog. Get daily market analysis, investment strategies, economic insights, and personal finance tips from our financial experts.',
    type: 'website',
    url: 'https://asklinc.com/blog',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ask Linc Blog - Financial Insights & Market Analysis',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Financial Insights & Market Analysis | Ask Linc Blog',
    description: 'Stay ahead of the financial curve with Ask Linc\'s expert blog.',
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

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
      <SiteFooter />
    </div>
  );
}
