import GhostContentAPI from '@tryghost/content-api';

// Only create the Ghost client if environment variables are available
export const ghost = process.env.GHOST_URL && process.env.GHOST_CONTENT_KEY 
  ? new GhostContentAPI({
      url: process.env.GHOST_URL,
      key: process.env.GHOST_CONTENT_KEY,
      version: 'v5.0'
    })
  : null;

export type GhostPost = {
  id: string;
  uuid?: string;
  title?: string | null;
  slug?: string | null;
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
