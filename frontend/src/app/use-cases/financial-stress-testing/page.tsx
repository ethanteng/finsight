import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Financial Stress Testing — Use Cases | Ask Linc',
  description: 'Stress test your portfolio, assess withdrawal sustainability, and model the impact of geopolitical events on your retirement plans.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/financial-stress-testing',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function FinancialStressTestingUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'financial-stress-testing'] })} />;
}
