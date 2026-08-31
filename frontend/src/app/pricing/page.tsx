import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';
import StructuredData from '../../components/StructuredData';
import { buildFaqPageSchema, PRODUCT_OFFER_SCHEMA } from '../../data/faq';
import { MONTHLY_PRICE_DOLLARS, MONTHLY_PRICE_LABEL } from '../../config/pricing';

export const metadata: Metadata = {
  title: `Ask Linc Pricing — 1 Month Free, Then ${MONTHLY_PRICE_LABEL}`,
  description:
    `Start with 1 month free, then pay ${MONTHLY_PRICE_LABEL} for unlimited questions, connected accounts, what-if scenarios, and math you can check. Cancel anytime.`,
  keywords: [
    'Ask Linc pricing',
    'AI financial advisor cost',
    'affordable financial planning',
    `${MONTHLY_PRICE_DOLLARS} financial AI`,
  ],
  alternates: {
    canonical: 'https://asklinc.com/pricing',
  },
  openGraph: {
    title: `Pricing | Ask Linc — 1 Month Free, Then ${MONTHLY_PRICE_LABEL}`,
    description:
      `Start with 1 month free, then pay ${MONTHLY_PRICE_LABEL} for unlimited questions, connected accounts, what-if scenarios, and math you can check. Cancel anytime.`,
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
