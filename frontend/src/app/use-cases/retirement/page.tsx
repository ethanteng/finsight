import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Retirement Planning — Use Cases | Ask Linc',
  description: 'Move from a Coast FIRE or retirement number to a stress-tested plan for retirement age, spending, Social Security, portfolio risk, and income timing.',
  path: '/use-cases/retirement',
  imageAlt: 'Ask Linc retirement planning',
});

export default function RetirementUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'retirement'] })} />;
}
