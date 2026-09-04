import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Retirement Planning — Use Cases | Ask Linc',
  description: 'See whether you are on track for retirement, how much your investments may need to provide, and what could change the answer.',
  path: '/use-cases/retirement',
  imageAlt: 'Ask Linc retirement planning',
});

export default function RetirementUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'retirement'] })} />;
}
