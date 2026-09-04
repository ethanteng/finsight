import type { MetadataRoute } from 'next';

const BASE_URL = 'https://asklinc.com';

/**
 * robots.txt
 *
 * Search engines need access to Next.js assets in order to render public pages.
 * HTML utility routes are crawlable but carry noindex directives, which bots
 * can only process when robots.txt permits the request.
 *
 * AI crawlers (GPTBot, PerplexityBot, ClaudeBot, Google-Extended, etc.) are
 * intentionally NOT blocked — they fall under `User-agent: *` and are permitted.
 * Blocking them would make the site ineligible for citation in AI answers.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
