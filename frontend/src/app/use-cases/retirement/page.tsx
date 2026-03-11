import type { Metadata } from 'next';
import RetirementUseCasePage from '../../../components/RetirementUseCasePage';

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
  return <RetirementUseCasePage />;
}
