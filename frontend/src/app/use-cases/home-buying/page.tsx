import type { Metadata } from 'next';
import UseCaseStubPage from '../../../components/UseCaseStubPage';

export const metadata: Metadata = {
  title: 'Home Buying Decisions — Use Cases | Ask Linc',
  description: 'Evaluate affordability, mortgage scenarios, and long-term impact.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/home-buying',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HomeBuyingUseCaseRoute() {
  return (
    <UseCaseStubPage
      title="Home Buying Decisions"
      description="Evaluate affordability, mortgage scenarios, and long-term impact."
    />
  );
}
