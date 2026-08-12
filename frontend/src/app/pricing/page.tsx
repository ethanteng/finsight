import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';
import StructuredData from '../../components/StructuredData';
import { buildFaqPageSchema, PRODUCT_OFFER_SCHEMA } from '../../data/faq';

export const metadata: Metadata = {
  title: 'Pricing | Ask Linc — $9/month AI Financial Reasoning',
  description:
    '$9/month flat for full access to Ask Linc — vs the 1-2% of your wealth a human advisor charges every year. Cancel anytime. See a real answer free in the demo.',
  keywords: [
    'Ask Linc pricing',
    'AI financial advisor cost',
    'affordable financial planning',
    '$9 financial AI',
  ],
  alternates: {
    canonical: 'https://asklinc.com/pricing',
  },
  openGraph: {
    title: 'Pricing | Ask Linc — $9/month',
    description:
      '$9/month flat for decisions-ready financial answers — not charts. Cancel anytime.',
    type: 'website',
    url: 'https://asklinc.com/pricing',
    siteName: 'Ask Linc',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PricingPage() {
  return (
    <>
      <StructuredData data={PRODUCT_OFFER_SCHEMA} />
      <StructuredData data={buildFaqPageSchema()} />
      <MarketingSubpage params={Promise.resolve({ slug: ['pricing'] })} />
    </>
  );
}
