import type { Metadata } from 'next';
import UseCaseStubPage from '../../../components/UseCaseStubPage';

export const metadata: Metadata = {
  title: 'Investment Portfolio Analysis — Use Cases | Ask Linc',
  description: 'Analyze asset allocation, risk exposure, and diversification.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/portfolio-analysis',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PortfolioAnalysisUseCaseRoute() {
  return (
    <UseCaseStubPage
      title="Investment Portfolio Analysis"
      description="Analyze asset allocation, risk exposure, and diversification."
    />
  );
}
