import type { Metadata } from 'next';
import RetirementUseCasePage from '../../../components/RetirementUseCasePage';
import { getPostsByTag } from '@/lib/ghost';

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

export const revalidate = 60;

export default async function RetirementUseCaseRoute() {
  // Try "retirement" first, then "retirement-planning" as fallback
  let retirementPosts = await getPostsByTag('retirement', 6);
  if (retirementPosts.length === 0) {
    retirementPosts = await getPostsByTag('retirement-planning', 6);
  }
  return <RetirementUseCasePage retirementPosts={retirementPosts} />;
}
