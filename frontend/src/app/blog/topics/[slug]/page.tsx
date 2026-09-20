import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllPosts, type GhostPost } from '@/lib/ghost';
import { findBlogTopic, listBlogTopics, postsForTopic } from '@/lib/blog-topics';
import { MarketingBlogTopicPage } from '@/components/marketing/MarketingSubpage';

export const revalidate = 60;

async function getPublishedPosts(): Promise<GhostPost[]> {
  const posts = await getAllPosts();
  return posts.filter((post) => post.slug && post.title);
}

export async function generateStaticParams() {
  const topics = listBlogTopics(await getPublishedPosts());
  return topics.map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const topic = findBlogTopic(await getPublishedPosts(), slug);
  if (!topic) return { title: 'Topic | Ask Linc Blog', robots: { index: false, follow: true } };

  const title = `${topic.name} | Ask Linc Blog`;
  const description = `Ask Linc blog posts on ${topic.name.toLowerCase()} — guides and articles from Ask Linc.`;
  const url = `https://asklinc.com/blog/topics/${topic.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      siteName: 'Ask Linc',
      images: [{ url: 'https://asklinc.com/og-image.jpg', width: 1200, height: 630, alt: 'Ask Linc financial planning blog' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://asklinc.com/og-image.jpg'],
    },
    robots: { index: true, follow: true },
  };
}

export default async function BlogTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const posts = await getPublishedPosts();
  const topic = findBlogTopic(posts, slug);
  // An unknown topic — or one whose last post was unpublished — is a 404, not
  // an empty archive page for search engines to index.
  if (!topic) notFound();

  return (
    <MarketingBlogTopicPage
      topic={topic}
      posts={postsForTopic(posts, topic.slug)}
      allTopics={listBlogTopics(posts)}
    />
  );
}
