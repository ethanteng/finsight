import type { Metadata } from 'next';
import MarketingSubpage from '../../../components/marketing/MarketingSubpage';

export const metadata: Metadata = {
  title: 'Home Buying Decisions — Use Cases | Ask Linc',
  description: 'Evaluate affordability, mortgage scenarios, emergency fund readiness, and long-term impact of a home purchase.',
  alternates: {
    canonical: 'https://asklinc.com/use-cases/home-buying',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HomeBuyingUseCaseRoute() {
  return <MarketingSubpage params={Promise.resolve({ slug: ['use-cases', 'home-buying'] })} />;
}
