import { processGhostHtml } from '@/lib/ghost';
import { buildMarketingMetadata } from '@/lib/seo';

describe('SEO metadata', () => {
  it('builds canonical and social metadata for a marketing page', () => {
    const metadata = buildMarketingMetadata({
      title: 'A Useful Page | Ask Linc',
      description: 'A page description written for people deciding whether this result is useful.',
      path: '/useful-page',
      imageAlt: 'Useful Ask Linc page',
    });

    expect(metadata).toMatchObject({
      alternates: { canonical: 'https://asklinc.com/useful-page' },
      openGraph: {
        title: 'A Useful Page | Ask Linc',
        url: 'https://asklinc.com/useful-page',
        images: [{ url: 'https://asklinc.com/og-image.jpg', alt: 'Useful Ask Linc page' }],
      },
      twitter: {
        card: 'summary_large_image',
        images: ['https://asklinc.com/og-image.jpg'],
      },
      robots: { index: true, follow: true },
    });
  });

  it('keeps rendered Ghost links on clean canonical URLs', () => {
    const html = [
      '<a href="https://blog.asklinc.com/first-post/">Legacy</a>',
      '<a href="https://asklinc.com/blog/second-post?ref=blog.asklinc.com">Current</a>',
      '<a href="https://asklinc.com/?utm_source=ghost&amp;utm_medium=blog">Campaign</a>',
    ].join('');

    const processed = processGhostHtml(html);

    expect(processed).toContain('href="/blog/first-post/"');
    expect(processed).toContain('href="https://asklinc.com/blog/second-post"');
    expect(processed).not.toContain('?ref=blog.asklinc.com');
    expect(processed).toContain('utm_source=ghost');
  });
});
