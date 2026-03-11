import type { Metadata } from 'next';
import PortfolioAnalysisUseCasePage from '../../../components/PortfolioAnalysisUseCasePage';
import { getPostsByTag } from '@/lib/ghost';

export const metadata: Metadata = {
  title: 'Investment Portfolio Analysis — Use Cases | Ask Linc',
  description: 'Analyze asset allocation, risk exposure, diversification, and stress-test your portfolio for long-term sustainability.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/portfolio-analysis',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const revalidate = 60;

export default async function PortfolioAnalysisUseCaseRoute() {
  let moneyTrendsPosts = await getPostsByTag('money-trends', 6);
  if (moneyTrendsPosts.length === 0) {
    moneyTrendsPosts = await getPostsByTag('portfolio', 6);
  }
  return <PortfolioAnalysisUseCasePage moneyTrendsPosts={moneyTrendsPosts} />;
}
