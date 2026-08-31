import type { Metadata } from 'next';
import MarketingSubpage from '../../components/marketing/MarketingSubpage';
import StructuredData from '../../components/StructuredData';
import { buildFaqItems, buildFaqPageSchema, buildProductOfferSchema } from '../../data/faq';
import { getPricing } from '../../lib/pricing';

export async function generateMetadata(): Promise<Metadata> {
  const pricing = await getPricing();
  return {
  title: `Ask Linc Pricing — 1 Month Free, Then ${pricing.label}`,
  description:
    `Start with 1 month free, then pay ${pricing.label} for unlimited questions, connected accounts, what-if scenarios, and math you can check. Cancel anytime.`,
  keywords: [
    'Ask Linc pricing',
    'AI financial advisor cost',
    'affordable financial planning',
    `${pricing.dollars} financial AI`,
  ],
  alternates: {
    canonical: 'https://asklinc.com/pricing',
  },
  openGraph: {
    title: `Pricing | Ask Linc — 1 Month Free, Then ${pricing.label}`,
    description:
      `Start with 1 month free, then pay ${pricing.label} for unlimited questions, connected accounts, what-if scenarios, and math you can check. Cancel anytime.`,
    type: 'website',
    url: 'https://asklinc.com/pricing',
    siteName: 'Ask Linc',
  },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function PricingPage() {
  const pricing = await getPricing();
  return (
    <>
      <StructuredData data={buildProductOfferSchema(pricing)} />
      <StructuredData data={buildFaqPageSchema(buildFaqItems(pricing))} />
      <MarketingSubpage params={Promise.resolve({ slug: ['pricing'] })} />
    </>
  );
}
