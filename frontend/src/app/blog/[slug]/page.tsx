import { ghost, type GhostPost, processGhostHtml } from '@/lib/ghost';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import BlogSubscription from '@/components/BlogSubscription';
import type { Metadata } from 'next';

export const revalidate = 60; // Revalidate every minute

async function getPost(slug: string): Promise<GhostPost | null> {
  if (!ghost) {
    console.warn('Ghost client not configured');
    return null;
  }
  
  try {
    const post = await ghost.posts.read({ slug }, { include: ['tags', 'authors'] });
    return post;
  } catch (error) {
    console.error('Error fetching post:', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post || !post.title) {
    return {
      title: 'Blog Post | Ask Linc',
      description: 'Read the latest financial insights and market analysis from Ask Linc.',
    };
  }

  return {
    title: `${post.title} | Ask Linc Financial Blog`,
    description: post.excerpt || `Read ${post.title} on Ask Linc's financial blog. Get expert insights on markets, investments, and personal finance.`,
    openGraph: {
      title: `${post.title} | Ask Linc`,
      description: post.excerpt || `Read ${post.title} on Ask Linc's financial blog.`,
      type: 'article',
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post || !post.title || !post.slug || !post.html) {
    notFound();
  }

  // Process HTML content to preserve Ghost formatting and fix links
  const processedHtml = processGhostHtml(post.html);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Back to blog link */}
        <Link 
          href="/blog" 
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-8 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Blog
        </Link>

        {/* Article header */}
        <article className="bg-white rounded-lg shadow-lg overflow-hidden">
          {post.feature_image && (
            <div className="relative h-96 w-full">
              <Image
                src={post.feature_image}
                alt={post.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}
          
          <div className="p-8">
            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {post.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Title */}
            <h1 className="text-4xl font-bold text-gray-900 mb-6 leading-tight">
              {post.title}
            </h1>

            {/* Meta information */}
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                {post.authors?.[0]?.profile_image && (
                  <Image
                    src={post.authors[0].profile_image}
                    alt={post.authors[0].name || 'Author'}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {post.authors?.[0]?.name || 'Anonymous'}
                  </p>
                  {post.authors?.[0]?.bio && (
                    <p className="text-sm text-gray-600">{post.authors[0].bio}</p>
                  )}
                </div>
              </div>
              
              <div className="text-right text-sm text-gray-500">
                {post.published_at && (
                  <p>Published {new Date(post.published_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}</p>
                )}
                {post.reading_time && (
                  <p>{post.reading_time} min read</p>
                )}
              </div>
            </div>

            {/* Content */}
            <div 
              className="ghost-content prose prose-lg max-w-none 
                prose-headings:text-gray-900 prose-headings:font-bold
                prose-h1:text-4xl prose-h1:mb-6 prose-h1:mt-8
                prose-h2:text-3xl prose-h2:mb-4 prose-h2:mt-6
                prose-h3:text-2xl prose-h3:mb-3 prose-h3:mt-5
                prose-h4:text-xl prose-h4:mb-2 prose-h4:mt-4
                prose-p:text-gray-700 prose-p:mb-4 prose-p:leading-relaxed
                prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium
                prose-strong:text-gray-900 prose-strong:font-semibold
                prose-em:text-gray-800 prose-em:italic
                prose-blockquote:border-l-4 prose-blockquote:border-l-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-r prose-blockquote:my-6 prose-blockquote:italic
                prose-ul:my-4 prose-ol:my-4 prose-li:my-1
                prose-code:text-sm prose-code:bg-gray-100 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:font-mono
                prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
                prose-img:rounded-lg prose-img:shadow-md prose-img:my-6
                prose-hr:my-8 prose-hr:border-gray-300
                prose-table:w-full prose-table:border-collapse prose-table:my-6
                prose-th:border prose-th:border-gray-300 prose-th:px-4 prose-th:py-2 prose-th:bg-gray-50 prose-th:text-left prose-th:font-semibold
                prose-td:border prose-td:border-gray-300 prose-td:px-4 prose-td:py-2
                prose-figure:my-6 prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-gray-600"
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          </div>
        </article>

        {/* Subscription Form */}
        <div className="mt-12">
          <BlogSubscription />
        </div>
      </div>
    </div>
  );
}
