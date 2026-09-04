import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Home Buying Decisions — Use Cases | Ask Linc',
  description: 'Evaluate affordability, mortgage scenarios, emergency fund readiness, and long-term impact of a home purchase.',
  path: '/use-cases/home-buying',
  imageAlt: 'Ask Linc home affordability planning',
});

export default function HomeBuyingUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'home-buying'] })} />;
}
