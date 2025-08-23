import { ghost, type GhostPost } from '@/lib/ghost';
import { Brain } from 'lucide-react';
import Link from 'next/link';
import BlogPostsList from './BlogPostsList';
import BlogSubscription from '@/components/BlogSubscription';

export const revalidate = 60; // Revalidate every minute

async function getPosts(): Promise<GhostPost[]> {
  if (!ghost) {
    console.warn('Ghost client not configured');
    return [];
  }
  
  try {
    const posts = await ghost.posts.browse({ 
      limit: 20, 
      include: ['tags', 'authors'],
      order: 'published_at DESC'
    });
    
    return posts;
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
}

export default async function BlogPage() {
  const posts = await getPosts();
  
  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Header with your brand */}
        <div className="text-center mb-16">
          <Link href="/" className="inline-block hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-center mb-8">
              <Brain className="h-20 w-20 text-primary mr-6" />
              <span className="text-6xl font-bold gradient-text">Ask Linc</span>
              <span className="text-6xl font-bold text-blue-400 ml-4">Blog</span>
            </div>
          </Link>
          <p className="text-2xl text-gray-300">Daily financial market insights & occasional product updates</p>
        </div>

        {/* Subscription Form */}
        <BlogSubscription />

        {/* Blog Posts List with Filtering */}
        <BlogPostsList posts={posts} />
      </div>
    </div>
  );
}
