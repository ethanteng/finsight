import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Retirement Planning — Use Cases | Ask Linc',
  description: 'See how Ask Linc analyzes retirement readiness, withdrawal rates, and portfolio sustainability.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/retirement',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RetirementUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'retirement'] })} />;
}
