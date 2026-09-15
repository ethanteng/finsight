import type { GhostPost } from './ghost';

/**
 * Blog "topics" are Ghost tags, but only a post's FIRST tag counts.
 * That is the tag the blog index and article headers already display as the
 * post's category, so deriving topic pages from the same tag keeps the label
 * on a card and the page it links to in agreement. Filtering Ghost with
 * `tag:{slug}` would also return posts that carry the tag in second position,
 * which would list posts under a topic their own card never advertises.
 */
export type BlogTopic = {
  name: string;
  slug: string;
  count: number;
};

/** Ghost tags normally carry a slug; derive one when a tag only has a name. */
export function topicSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function primaryTopic(post: GhostPost): { name: string; slug: string } | null {
  const tag = post.tags?.[0];
  const name = tag?.name?.trim();
  if (!name) return null;

  const slug = tag?.slug?.trim() || topicSlugFromName(name);
  return slug ? { name, slug } : null;
}

export function topicHref(slug: string): string {
  return `/blog/topics/${slug}`;
}

/** Every topic that has at least one published post, in post order. */
export function listBlogTopics(posts: GhostPost[]): BlogTopic[] {
  const topics = new Map<string, BlogTopic>();

  for (const post of posts) {
    const topic = primaryTopic(post);
    if (!topic) continue;

    const existing = topics.get(topic.slug);
    if (existing) {
      existing.count += 1;
    } else {
      topics.set(topic.slug, { ...topic, count: 1 });
    }
  }

  return Array.from(topics.values());
}

export function postsForTopic(posts: GhostPost[], slug: string): GhostPost[] {
  const wanted = slug.toLowerCase();
  return posts.filter((post) => primaryTopic(post)?.slug.toLowerCase() === wanted);
}

export function findBlogTopic(posts: GhostPost[], slug: string): BlogTopic | null {
  const wanted = slug.toLowerCase();
  return listBlogTopics(posts).find((topic) => topic.slug.toLowerCase() === wanted) ?? null;
}
