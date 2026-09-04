import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Planning for a Child, Leave, and Childcare — Ask Linc',
  description: 'Plan parental leave, childcare costs, housing, emergency savings, and retirement contributions together before growing your family.',
  path: '/use-cases/family-planning',
  imageAlt: 'Ask Linc family financial planning',
});

export default function FamilyPlanningUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'family-planning'] })} />;
}
