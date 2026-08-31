import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Get Help & Support | Ask Linc Customer Service',
  description: 'Need help with Ask Linc? Ask a question, share feedback, request data deletion, or report something that is not working.',
  keywords: ['customer support', 'help center', 'contact Ask Linc', 'customer service', 'support'],
  alternates: {
    canonical: 'https://asklinc.com/contact',
  },
  openGraph: {
    title: 'Get Help & Support | Ask Linc Customer Service',
    description: 'Need help with Ask Linc? Our support team is here to assist you.',
    type: 'website',
    url: 'https://asklinc.com/contact',
    siteName: 'Ask Linc',
    images: [
      {
        url: 'https://asklinc.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Ask Linc Contact - Customer Support',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get Help & Support | Ask Linc Customer Service',
    description: 'Need help with Ask Linc? Our support team is here to assist you.',
    images: ['https://asklinc.com/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ContactPage() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['contact'] })} />;
}
