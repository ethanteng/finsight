import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Retirement Stress Test | Ask Linc',
  description: 'Stress-test your retirement plan against market drops, inflation, spending changes, and different retirement dates using your accounts and historical returns.',
  path: '/use-cases/financial-stress-testing',
  imageAlt: 'Ask Linc financial stress testing',
});

export default function FinancialStressTestingUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'financial-stress-testing'] })} />;
}
