import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Retirement Planning — Use Cases | Ask Linc',
  description: 'See whether you are on track for retirement, how much your investments may need to provide, and what could change the answer.',
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
