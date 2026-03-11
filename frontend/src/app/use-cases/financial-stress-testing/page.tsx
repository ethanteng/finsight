import type { Metadata } from 'next';
import UseCaseStubPage from '../../../components/UseCaseStubPage';

export const metadata: Metadata = {
  title: 'Financial Stress Testing — Use Cases | Ask Linc',
  description: 'Simulate market downturns and evaluate resilience.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/financial-stress-testing',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function FinancialStressTestingUseCaseRoute() {
  return (
    <UseCaseStubPage
      title="Financial Stress Testing"
      description="Simulate market downturns and evaluate resilience."
    />
  );
}
