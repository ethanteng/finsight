import { ghost, type GhostPost } from '@/lib/ghost';
import { MarketingBlogPage } from '@/components/marketing/MarketingSubpage';

export const revalidate = 60;

async function getPosts(): Promise<GhostPost[]> {
  if (!ghost) return [];

  try {
    return await ghost.posts.browse({
      limit: 10000,
      include: ['tags', 'authors'],
      order: 'published_at DESC',
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
}

export default async function BlogPage() {
  return <MarketingBlogPage ghostPosts={await getPosts()} />;
}
