import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';
import StructuredData from '../../components/StructuredData';
import { buildFaqItems, buildFaqPageSchema } from '../../data/faq';
import { getPricing } from '../../lib/pricing';

export const metadata: Metadata = {
  title: 'FAQ | Frequently Asked Questions | Ask Linc',
  description: 'Common questions about Ask Linc: what it does, what it costs, how it protects your data, and how it checks the math.',
  keywords: ['FAQ', 'frequently asked questions', 'Ask Linc', 'financial AI', 'budget app'],
  alternates: {
    canonical: 'https://asklinc.com/faq',
  },
  openGraph: {
    title: 'FAQ | Frequently Asked Questions | Ask Linc',
    description: 'Common questions about Ask Linc, including accounts, pricing, privacy, and how answers are checked.',
    type: 'website',
    url: 'https://asklinc.com/faq',
    siteName: 'Ask Linc',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function FaqPage() {
  const pricing = await getPricing();
  return (
    <>
      <StructuredData data={buildFaqPageSchema(buildFaqItems(pricing))} />
      <MarketingSubpage params={Promise.resolve({ slug: ['faq'] })} />
    </>
  );
}
