import type { Metadata } from 'next';
import HomeBuyingUseCasePage from '../../../components/HomeBuyingUseCasePage';
import { getPostsByTag } from '@/lib/ghost';

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

export const revalidate = 60;

export default async function HomeBuyingUseCaseRoute() {
  let homeBuyingPosts = await getPostsByTag('home-buying', 6);
  if (homeBuyingPosts.length === 0) {
    homeBuyingPosts = await getPostsByTag('mortgage', 6);
  }
  return <HomeBuyingUseCasePage homeBuyingPosts={homeBuyingPosts} />;
}
