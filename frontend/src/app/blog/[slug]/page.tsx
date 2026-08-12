import { ghost, type GhostPost, processGhostHtml } from '@/lib/ghost';
import { notFound } from 'next/navigation';
import StructuredData from '@/components/StructuredData';
import { MarketingArticlePage } from '@/components/marketing/MarketingSubpage';
import type { Metadata } from 'next';

export const revalidate = 60;

async function getPost(slug: string): Promise<GhostPost | null> {
  if (!ghost) return null;
  try {
    return await ghost.posts.read({ slug }, { include: ['tags', 'authors'] });
  } catch (error) {
    console.error('Error fetching post:', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post?.title) return { title: 'Blog Post | Ask Linc', alternates: { canonical: `https://asklinc.com/blog/${slug}` } };

  const postUrl = `https://asklinc.com/blog/${slug}`;
  const description = post.excerpt || `Read ${post.title} on Ask Linc's financial blog.`;
  return {
    title: `${post.title} | Ask Linc`,
    description,
    alternates: { canonical: postUrl },
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      url: postUrl,
      siteName: 'Ask Linc',
      images: post.feature_image ? [{ url: post.feature_image }] : undefined,
      publishedTime: post.published_at ? new Date(post.published_at).toISOString() : undefined,
      modifiedTime: post.updated_at ? new Date(post.updated_at).toISOString() : undefined,
      authors: [post.authors?.[0]?.name || 'Ethan Teng'],
    },
    robots: { index: true, follow: true },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post?.title || !post.html) notFound();

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.feature_image,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: { '@type': 'Person', name: post.authors?.[0]?.name || 'Ethan Teng' },
    publisher: { '@type': 'Organization', name: 'Ask Linc', logo: { '@type': 'ImageObject', url: 'https://asklinc.com/logo.png' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://asklinc.com/blog/${slug}` },
  };

  return (
    <>
      <StructuredData data={articleSchema} />
      <MarketingArticlePage post={post} processedHtml={processGhostHtml(post.html)} />
    </>
  );
}
