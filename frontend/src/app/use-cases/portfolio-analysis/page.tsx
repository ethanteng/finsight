import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';

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

export default function PortfolioAnalysisUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'portfolio-analysis'] })} />;
}
