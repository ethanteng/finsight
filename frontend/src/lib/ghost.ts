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
  meta_description?: string | null;
  slug?: string | null;
  url?: string | null;
  html?: string | null;
  feature_image?: string | null;
  feature_image_alt?: string | null;
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
 * Every published post, newest first, with tags and authors attached.
 * The blog index, the topic pages, and the sitemap all need the same list,
 * and Next.js dedupes the fetch across them within a render.
 */
export async function getAllPosts(): Promise<GhostPost[]> {
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

const HTML_ATTRIBUTE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function readAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const body = tag.replace(/^<\w+/, '').replace(/\/?>$/, '');
  for (const [, name, double, single, bare] of body.matchAll(HTML_ATTRIBUTE)) {
    attributes.set(name.toLowerCase(), double ?? single ?? bare ?? '');
  }
  return attributes;
}

function quoted(value: string): string {
  return `"${value.replace(/"/g, '&quot;')}"`;
}

const VIDEO_ATTRIBUTES = ['src', 'width', 'height', 'loop', 'autoplay', 'muted', 'playsinline', 'preload'];

/**
 * Ghost's video card is a bare <video> plus a hand-built player (play button,
 * seek and volume sliders, a speed toggle) that only Ghost's cards.min.js and
 * cards.min.css bring to life. We load neither, so the player rendered as a
 * row of unstyled, dead controls. Keep the video and hand playback to the
 * browser's own controls. A looping video is Ghost's GIF-like mode: it plays
 * muted on its own and Ghost shows it no controls, so neither do we.
 */
function nativeVideoCard(card: string): string {
  const figure = readAttributes(card.match(/^<figure\b[^>]*>/)?.[0] ?? '');
  const videoTag = card.match(/<video\b[^>]*>/)?.[0];
  if (!videoTag) return card;

  const video = readAttributes(videoTag);
  if (!video.get('src')) return card;

  const attributes: string[] = [];
  for (const name of VIDEO_ATTRIBUTES) {
    if (!video.has(name)) continue;
    const value = video.get(name)!;
    attributes.push(value ? `${name}=${quoted(value)}` : name);
  }
  // Ghost's own poster is a transparent spacer; the real frame is the thumbnail.
  const poster = figure.get('data-kg-custom-thumbnail') || figure.get('data-kg-thumbnail');
  if (poster) attributes.push(`poster=${quoted(poster)}`);
  if (!video.has('loop')) attributes.push('controls');

  const caption = card.match(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/)?.[0] ?? '';
  const figureClass = figure.get('class') || 'kg-card kg-video-card';
  return `<figure class=${quoted(figureClass)}><video ${attributes.join(' ')}></video>${caption}</figure>`;
}

/**
 * Process Ghost HTML content to preserve formatting and fix links
 */
export function processGhostHtml(html: string): string {
  if (!html) return '';

  return html
    .replace(/<figure\b[^>]*\bkg-video-card\b[^>]*>[\s\S]*?<\/figure>/g, nativeVideoCard)
    // Fix absolute links from Ghost domains. Uploaded files (images, video,
    // audio) live on storage.ghost.io or under /content/ on the blog's own
    // host; they are files, not posts, and have no page under /blog/.
    .replace(/https:\/\/(?!storage\.ghost\.io\/)[a-z0-9-]+\.ghost\.io\/(?!content\/)/g, '/blog/')
    .replace(/https:\/\/blog\.asklinc\.com\/(?!content\/)/g, '/blog/')
    .replace(/https:\/\/asklinc\.com\/blog\//g, '/blog/')
    // Next.js serves article canonicals without a trailing slash. Normalize
    // internal article links so they do not take an unnecessary 308 hop.
    // Leave the /blog/ index alone and preserve query strings/fragments.
    .replace(
      /href=(["'])(\/blog\/[^"'?#]+?)\/(?=([?#][^"']*)?\1)/g,
      'href=$1$2'
    )
    // Ghost's Content API can append its source marker to rendered links.
    // Keep internal links on their clean canonical URLs.
    .replace(/\?ref=blog\.asklinc\.com(?=["'#\s<])/g, '')
    // Preserve Ghost's original formatting classes
    .replace(/class="kg-/g, 'class="ghost-kg-')
    // Ensure proper spacing for Ghost's content blocks
    .replace(/<p><\/p>/g, '<br>')
    // Preserve Ghost's image captions
    .replace(/<figcaption>/g, '<figcaption class="ghost-caption">')
    // Preserve Ghost's gallery layouts
    .replace(/class="kg-gallery/g, 'class="ghost-gallery')
    // Preserve Ghost's card layouts
    .replace(/class="kg-card/g, 'class="ghost-card')
    // Give tables a wrapper to scroll inside. A wide comparison table has a
    // min-content width that no amount of `width: 100%` will shrink, and
    // without this it drags the whole article past the viewport on a phone.
    .replace(/<table\b/g, '<div class="ghost-table-wrap"><table')
    .replace(/<\/table>/g, '</table></div>');
}
