import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Planning for a Child, Leave, and Childcare — Ask Linc',
  description: 'Plan parental leave, childcare costs, housing, emergency savings, and retirement contributions together before growing your family.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/family-planning',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function FamilyPlanningUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'family-planning'] })} />;
}
