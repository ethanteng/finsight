import GhostContentAPI from '@tryghost/content-api';

// Only create the Ghost client if environment variables are available
// Supports both GHOST_URL/GHOST_CONTENT_KEY and GHOST_API_URL/GHOST_CONTENT_API_KEY
const ghostUrl = process.env.GHOST_URL || process.env.GHOST_API_URL;
const ghostKey = process.env.GHOST_CONTENT_KEY || process.env.GHOST_CONTENT_API_KEY;
export const ghost = ghostUrl && ghostKey
  ? new GhostContentAPI({
      url: ghostUrl,
      key: ghostKey,
      version: 'v5.0'
    })
  : null;

export type GhostPost = {
  id: string;
  uuid?: string;
  title?: string | null;
  meta_title?: string | null;
  slug?: string | null;
  url?: string | null;
  html?: string | null;
  feature_image?: string | null;
  excerpt?: string | null;
  reading_time?: number | null;
  published_at?: string | null;
  updated_at?: string | null;
  tags?: Array<{
    id: string;
    name?: string;
    slug?: string;
  }> | null;
  authors?: Array<{
    id: string;
    name?: string;
    slug?: string;
    profile_image?: string | null;
    bio?: string | null;
  }> | null;
};

export type GhostPosts = {
  posts: GhostPost[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      pages: number;
      total: number;
      next?: number;
      prev?: number;
    };
  };
};

/**
 * Fetch posts filtered by tag slug.
 * Per Ghost Content API: filter=tag:{slug}, include=authors,tags
 * @see https://docs.ghost.org/content-api/posts
 * @see https://docs.ghost.org/content-api/parameters#filter
 */
export async function getPostsByTag(tagSlug: string, limit = 6): Promise<GhostPost[]> {
  if (!ghost) {
    console.warn('Ghost client not configured');
    return [];
  }
  try {
    const result = await ghost.posts.browse({
      filter: `tag:${tagSlug}`,
      limit,
      include: ['tags', 'authors'],
      order: 'published_at DESC',
    });
    // SDK returns posts array (with .meta); raw API returns { posts: [] }
    const posts = Array.isArray(result) ? result : (result as { posts?: GhostPost[] }).posts ?? [];
    if (posts.length > 0) return posts;

    // Fallback: fetch all and filter by tag (handles tag name vs slug mismatch)
    const all = await ghost.posts.browse({
      limit: 50,
      include: ['tags', 'authors'],
      order: 'published_at DESC',
    });
    const allPosts = Array.isArray(all) ? all : (all as { posts?: GhostPost[] }).posts ?? [];
    const tagLower = tagSlug.toLowerCase();
    return allPosts
      .filter((p) =>
        p.tags?.some((t) => (t.slug || t.name || '').toLowerCase() === tagLower)
      )
      .slice(0, limit);
  } catch (error) {
    console.error('Error fetching posts by tag:', error);
    return [];
  }
}

/**
 * Process Ghost HTML content to preserve formatting and fix links
 */
export function processGhostHtml(html: string): string {
  if (!html) return '';
  
  return html
    // Fix absolute links from Ghost domains
    .replace(/https:\/\/[^\/]+\.ghost\.io\//g, '/blog/')
    .replace(/https:\/\/blog\.asklinc\.com\//g, '/blog/')
    // Preserve Ghost's original formatting classes
    .replace(/class="kg-/g, 'class="ghost-kg-')
    // Ensure proper spacing for Ghost's content blocks
    .replace(/<p><\/p>/g, '<br>')
    // Preserve Ghost's image captions
    .replace(/<figcaption>/g, '<figcaption class="ghost-caption">')
    // Preserve Ghost's gallery layouts
    .replace(/class="kg-gallery/g, 'class="ghost-gallery')
    // Preserve Ghost's card layouts
    .replace(/class="kg-card/g, 'class="ghost-card');
}
