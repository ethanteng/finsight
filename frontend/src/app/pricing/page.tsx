import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';
import StructuredData from '../../components/StructuredData';
import { buildFaqPageSchema, PRODUCT_OFFER_SCHEMA } from '../../data/faq';

export const metadata: Metadata = {
  title: 'Ask Linc Pricing — 1 Month Free, Then $9/month',
  description:
    'Start with 1 month free, then pay $9/month for unlimited questions, connected accounts, what-if scenarios, and calculations you can inspect. Cancel anytime.',
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
    title: 'Pricing | Ask Linc — 1 Month Free, Then $9/month',
    description:
      'Start with 1 month free, then pay $9/month for unlimited questions, connected accounts, what-if scenarios, and calculations you can inspect. Cancel anytime.',
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
