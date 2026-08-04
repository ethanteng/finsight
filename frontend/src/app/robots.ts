import type { MetadataRoute } from 'next';

const BASE_URL = 'https://asklinc.com';

/**
 * robots.txt
 *
 * Note: `Allow` directives are only meaningful as exceptions to a `Disallow`.
 * With `Allow: /` as the base rule, listing individual public pages is a no-op,
 * so those have been removed.
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
        disallow: [
          '/admin',
          '/api/',
          '/_next/',
          '/static/',
          '/profile',
          '/payment-success',
          '/reset-password',
          '/verify-email',
          '/forgot-password',
          '/sentry-test',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
