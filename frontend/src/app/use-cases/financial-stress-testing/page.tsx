import type { Metadata } from 'next';
import FinancialStressTestingUseCasePage from '../../../components/FinancialStressTestingUseCasePage';
import { getPostsByTag } from '@/lib/ghost';

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

export const revalidate = 60;

export default async function FinancialStressTestingUseCaseRoute() {
  let moneyTrendsPosts = await getPostsByTag('money-trends', 6);
  if (moneyTrendsPosts.length === 0) {
    moneyTrendsPosts = await getPostsByTag('stress-testing', 6);
  }
  return <FinancialStressTestingUseCasePage moneyTrendsPosts={moneyTrendsPosts} />;
}
