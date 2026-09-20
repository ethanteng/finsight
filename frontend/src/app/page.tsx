import MarketingHome from '../components/marketing/MarketingHome';
import StructuredData from '../components/StructuredData';
import { buildProductOfferSchema } from '../data/faq';
import { getPricing } from '../lib/pricing';
import { buildMarketingMetadata } from '../lib/seo';

export const metadata = buildMarketingMetadata({
  title: 'Ask Linc | Financial Planning That Starts With Your Question',
  description: 'Connect your finances and tell Linc what you’re trying to figure out. Explore a financial plan, change assumptions, and see the math behind your next decision.',
  path: '',
});

export default async function Home() {
  const pricing = await getPricing();
  return <><StructuredData data={buildProductOfferSchema(pricing)} /><MarketingHome pricing={pricing} /></>;
}
