import type { MetadataRoute } from 'next';
import { ghost, type GhostPost } from '@/lib/ghost';

const BASE_URL = 'https://asklinc.com';

// Revalidate the sitemap hourly so newly published posts get picked up
export const revalidate = 3600;

type StaticRoute = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
};

/**
 * Public, indexable marketing pages only.
 *
 * Deliberately EXCLUDED:
 *  - Auth/utility routes (/login, /register, /forgot-password, /reset-password,
 *    /verify-email, /payment-success, /profile) — no search value, and they
 *    dilute crawl budget.
 *  - Authenticated app routes (/app, /finances, /transactions) — gated content.
 *  - /admin and /sentry-test — internal.
 *  - /privacy-policy — duplicate of /privacy, which carries the canonical.
 */
const STATIC_ROUTES: StaticRoute[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },

  // Core marketing
  { path: '/features', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/demo', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.4 },

  // Top-of-funnel content hubs
  { path: '/use-cases', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/use-cases/retirement', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/use-cases/portfolio-analysis', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/use-cases/home-buying', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/use-cases/financial-stress-testing', changeFrequency: 'monthly', priority: 0.8 },

  { path: '/prompts', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/prompts/retirement', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/prompts/portfolio-analysis', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/prompts/home-buying', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/prompts/financial-stress-testing', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/prompts/geopolitical-retirement', changeFrequency: 'monthly', priority: 0.7 },

  // Standalone tools / high-intent landing pages
  { path: '/retirement-readiness', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/buying-a-house', changeFrequency: 'monthly', priority: 0.9 },

  // Trust pages
  { path: '/how-we-protect-your-data', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },

  // Blog index
  { path: '/blog', changeFrequency: 'daily', priority: 0.9 },
];

async function getBlogEntries(): Promise<MetadataRoute.Sitemap> {
  if (!ghost) {
    console.warn('[sitemap] Ghost client not configured; emitting static routes only.');
    return [];
  }

  try {
    const posts = (await ghost.posts.browse({
      limit: 10000,
      fields: 'slug,updated_at,published_at',
      order: 'published_at DESC',
    })) as GhostPost[];

    return posts
      .filter((post) => Boolean(post?.slug))
      .map((post) => {
        const modified =
          (post as { updated_at?: string | null }).updated_at ??
          (post as { published_at?: string | null }).published_at ??
          null;

        return {
          url: `${BASE_URL}/blog/${post.slug}`,
          lastModified: modified ? new Date(modified) : new Date(),
          changeFrequency: 'monthly' as const,
          priority: 0.7,
        };
      });
  } catch (error) {
    // Never let a Ghost outage break the sitemap — degrade to static routes.
    console.error('[sitemap] Failed to fetch Ghost posts:', error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const blogEntries = await getBlogEntries();

  return [...staticEntries, ...blogEntries];
}
