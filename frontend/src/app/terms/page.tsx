import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'User Agreement & Terms | Ask Linc Platform Rules',
  description: 'Review Ask Linc\'s terms of service and user agreement. Understand your rights, responsibilities, and the rules governing your use of our AI financial assistant platform.',
  keywords: ['terms of service', 'user agreement', 'terms and conditions', 'platform rules'],
  alternates: {
    canonical: 'https://asklinc.com/terms',
  },
  openGraph: {
    title: 'User Agreement & Terms | Ask Linc Platform Rules',
    description: 'Review Ask Linc\'s terms of service and user agreement.',
    type: 'website',
    url: 'https://asklinc.com/terms',
    siteName: 'Ask Linc',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['terms'] })} />;
}
