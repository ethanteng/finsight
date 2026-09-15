import { getAllPosts } from '@/lib/ghost';
import { MarketingBlogPage } from '@/components/marketing/MarketingSubpage';

export const revalidate = 60;

export default async function BlogPage() {
  return <MarketingBlogPage ghostPosts={await getAllPosts()} />;
}
