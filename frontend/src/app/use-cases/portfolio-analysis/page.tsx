import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';
import { buildMarketingMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Investment Portfolio Analysis — Use Cases | Ask Linc',
  description: 'Analyze asset allocation, risk exposure, diversification, and stress-test your portfolio for long-term sustainability.',
  path: '/use-cases/portfolio-analysis',
  imageAlt: 'Ask Linc portfolio analysis',
});

export default function PortfolioAnalysisUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'portfolio-analysis'] })} />;
}
