import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Financial Stress Testing — Use Cases | Ask Linc',
  description: 'Stress test your portfolio, assess withdrawal sustainability, and model the impact of geopolitical events on your retirement plans.',
  path: '/use-cases/financial-stress-testing',
  imageAlt: 'Ask Linc financial stress testing',
});

export default function FinancialStressTestingUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'financial-stress-testing'] })} />;
}
